import { NextResponse } from "next/server";
import { CRITIC_LENS_COUNT, isCriticBaselineReportType } from "@/lib/critic/progress";
import { buildHumanizeGuidancePrompt } from "@/lib/humanize/guidance-prompt";
import { createManagedChatCompletion } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getReasoningModelCandidates } from "@/lib/lmstudio/model-selection";
import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { createClient } from "@/lib/supabase/server";

function getErrorMessage(error: unknown) {
  const lmStudioMessage = getLmStudioErrorMessage(error, "");
  if (lmStudioMessage) return lmStudioMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to humanize guidance.";
}

// Synchronous, user-facing wait -- no maxDuration meant this ran under
// Vercel's platform default rather than the 45s client-side SDK timeout,
// which a real cloud-model call can exceed on a slower model/tier. See
// src/lib/critic/run.ts for the incident this pattern traces back to.
export const maxDuration = 150;

export async function POST(_: Request, context: { params: Promise<{ bookId: string }> }) {
  const supabase = await createClient();
  let placeholderReportId: string | null = null;
  let bookId: string | null = null;

  try {
    ({ bookId } = await context.params);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    // Insert a durable placeholder before the LLM call (30s+) rather than
    // only writing a row on success -- previously a dropped connection or a
    // failed completion left nothing behind at all, and the panel's "latest
    // humanized_guidance report" would silently keep showing stale content
    // from whatever the last successful run was, with no sign a new attempt
    // was ever made. Finalized or marked failed in place below, so the panel
    // always reflects the most recent attempt, not just the last success.
    const { data: placeholder, error: placeholderError } = await supabase
      .from("coherence_reports")
      .insert({ book_id: bookId, report_type: "humanized_guidance", content: { status: "generating" } })
      .select("id")
      .single();
    if (placeholderError) throw placeholderError;
    placeholderReportId = placeholder.id;

    const { data: reports, error: reportsError } = await supabase
      .from("coherence_reports")
      .select("report_type,content,created_at")
      .eq("book_id", bookId)
      .in("report_type", [
        "critic:story_structure",
        "critic:prose_quality",
        "critic:continuity",
        "critic:character_depth",
        "critic:market_fit",
        "critic:contemporary_view",
        "critic:revision_priorities",
        "rewrite_drift_check",
      ])
      .order("created_at", { ascending: false })
      .limit(24);
    if (reportsError) throw reportsError;

    const settings = await getUserLmStudioSettings(user.id);
    const modelPlan = await selectAndPrepareActiveModel(settings, {
      task: "planning",
      candidates: getReasoningModelCandidates(settings),
      expectedCalls: 1,
      latencyPreference: "quality",
      telemetry: { supabase, userId: user.id },
    });
    const { client, preparedModel, telemetryContext } = modelPlan;

    const criticReports = (reports || [])
      .filter((report) => isCriticBaselineReportType(String(report.report_type)))
      .map((report) => ({ reportType: report.report_type, content: report.content as Record<string, unknown> | null }))
      .slice(0, CRITIC_LENS_COUNT);
    const driftReports = (reports || [])
      .filter((report) => report.report_type === "rewrite_drift_check")
      .map((report) => ({ content: report.content as Record<string, unknown> | null }))
      .slice(0, 3);

    const completion = await createManagedChatCompletion(
      client,
      preparedModel,
      {
        temperature: Math.min(settings.temperature, 0.45),
        top_p: settings.topP,
        max_tokens: 3000,
        messages: [{ role: "user", content: buildHumanizeGuidancePrompt({ criticReports, driftReports }) }],
      },
      undefined,
      telemetryContext,
      { timeoutMs: 140_000 },
    );

    const parsed = parseModelJsonOrFallback(completion.choices[0]?.message.content || "{}", (raw, parseError) => ({
      headline: "Humanized guidance",
      authorFriendlySummary: raw,
      topPriorities: [],
      humanizedActionPlan: [],
      phrasingSuggestions: [],
      parseWarning: parseError,
    }));
    const content = typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : { authorFriendlySummary: String(parsed) };

    // coherence_reports has no UPDATE policy under RLS (INSERT/SELECT/DELETE
    // only) -- confirmed live: an .update() against the placeholder row
    // above returns success with zero rows actually changed, no error
    // surfaced. This table's established convention everywhere else in the
    // app is insert-new-row-and-read-latest, never mutate in place, so
    // finalize the same way: a fresh row that supersedes the placeholder as
    // the newest "humanized_guidance" report (reports are always read
    // ordered by created_at desc), leaving the placeholder as inert history.
    const { error: insertError } = await supabase.from("coherence_reports").insert({ book_id: bookId, report_type: "humanized_guidance", content });
    if (insertError) throw insertError;

    return NextResponse.json({ content });
  } catch (error) {
    if (placeholderReportId && bookId) {
      await supabase.from("coherence_reports").insert({
        book_id: bookId,
        report_type: "humanized_guidance",
        content: { status: "failed", error: getErrorMessage(error) },
      });
    }
    console.error("Humanize guidance failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
