import { NextResponse } from "next/server";
import { selectBestRewriteModel } from "@/lib/ai/rewrite-model-suitability";
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

export async function POST(_: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

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
    });
    const fit = selectBestRewriteModel(modelPlan.availableModels, {
      qualityProfile: settings.qualityProfile,
      contextWindowTokens: settings.contextWindowTokens,
    });
    const selectedModel = modelPlan.model;
    const selectedFit = fit.candidates.find((candidate) => candidate.model === selectedModel) || fit.best;
    const { client, preparedModel, modelSelection } = modelPlan;

    const criticReports = (reports || [])
      .filter((report) => String(report.report_type).startsWith("critic:"))
      .map((report) => ({ reportType: report.report_type, content: report.content as Record<string, unknown> | null }))
      .slice(0, 7);
    const driftReports = (reports || [])
      .filter((report) => report.report_type === "rewrite_drift_check")
      .map((report) => ({ content: report.content as Record<string, unknown> | null }))
      .slice(0, 3);

    const completion = await createManagedChatCompletion(client, preparedModel, {
      temperature: Math.min(settings.temperature, 0.45),
      top_p: settings.topP,
      max_tokens: 3000,
      messages: [{ role: "user", content: buildHumanizeGuidancePrompt({ criticReports, driftReports }) }],
      
    });

    const parsed = parseModelJsonOrFallback(completion.choices[0]?.message.content || "{}", (raw, parseError) => ({
      headline: "Humanized guidance",
      authorFriendlySummary: raw,
      topPriorities: [],
      humanizedActionPlan: [],
      phrasingSuggestions: [],
      parseWarning: parseError,
    }));
    const content = {
      ...(typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : { authorFriendlySummary: String(parsed) }),
      modelFit: {
        score: selectedFit?.score || 0,
        warning:
          selectedFit && selectedFit.score >= 80
            ? ""
            : "The selected local model may be limited for nuanced human voice guidance. Use the result as editorial direction, not final prose.",
        selectedModel,
        fitLabel: selectedFit?.label || "unknown",
        reasons: selectedFit?.reasons || [],
        lmStudioRuntimeLimits: preparedModel.runtimeLimits,
        lmStudioWarnings: preparedModel.warnings,
        modelSelection,
      },
    };

    const { error: insertError } = await supabase.from("coherence_reports").insert({
      book_id: bookId,
      report_type: "humanized_guidance",
      content,
    });
    if (insertError) throw insertError;

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Humanize guidance failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
