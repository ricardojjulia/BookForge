import { NextResponse } from "next/server";
import { z } from "zod";
import { createManagedChatCompletion } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getReasoningModelCandidates } from "@/lib/lmstudio/model-selection";
import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { buildRewriteDriftPrompt } from "@/lib/rewrite/drift-prompt";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  revisionJobId: z.string().uuid().optional(),
});

type RevisionSample = {
  original_text: string;
  revised_text: string;
  revision_notes: string | null;
  chapters?: { title?: string | null; chapter_number?: number | null } | null;
  paragraphs?: { paragraph_number?: number | null } | null;
};

function getErrorMessage(error: unknown) {
  const lmStudioMessage = getLmStudioErrorMessage(error, "");
  if (lmStudioMessage) return lmStudioMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Rewrite drift check failed.";
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const body = schema.parse(await readJsonBody(request));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const revisionJobId = body.revisionJobId || (await getLatestRewriteJobId(supabase, bookId));
    if (!revisionJobId) {
      return NextResponse.json({ error: "No rewrite job found to check." }, { status: 400 });
    }

    const [
      { data: bible },
      { data: rewritePlan },
      { data: continuityLedger },
      { data: revisions, error: revisionsError },
    ] = await Promise.all([
      supabase.from("book_bibles").select("content").eq("book_id", bookId).maybeSingle(),
      supabase
        .from("coherence_reports")
        .select("content")
        .eq("book_id", bookId)
        .eq("report_type", "rewrite_plan")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("coherence_reports")
        .select("content")
        .eq("book_id", bookId)
        .eq("report_type", "continuity_ledger")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("revision_versions")
        .select("original_text,revised_text,revision_notes,chapters(title,chapter_number),paragraphs(paragraph_number)")
        .eq("book_id", bookId)
        .eq("revision_job_id", revisionJobId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (revisionsError) throw revisionsError;

    const revisionSamples = ((revisions || []) as RevisionSample[]).map((revision) => ({
      chapterTitle: revision.chapters?.title || `Chapter ${revision.chapters?.chapter_number || "unknown"}`,
      paragraphNumber: revision.paragraphs?.paragraph_number || null,
      originalText: revision.original_text.slice(0, 1800),
      revisedText: revision.revised_text.slice(0, 1800),
      notes: revision.revision_notes,
    }));

    if (!revisionSamples.length) {
      return NextResponse.json({ error: "No revision samples found for this rewrite job." }, { status: 400 });
    }

    const settings = await getUserLmStudioSettings(user.id);
    const modelPlan = await selectAndPrepareActiveModel(settings, {
      task: "critic",
      candidates: getReasoningModelCandidates(settings),
      expectedCalls: 1,
      latencyPreference: "quality",
    });
    const { client, preparedModel, modelSelection } = modelPlan;
    const completion = await createManagedChatCompletion(client, preparedModel, {
      temperature: 0.2,
      top_p: settings.topP,
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: buildRewriteDriftPrompt({
            manuscriptBlueprint: bible?.content,
            rewritePlan: rewritePlan?.content,
            continuityLedger: continuityLedger?.content,
            revisionSamples,
          }),
        },
      ],
      response_format: { type: "text" },
    });

    const parsed = parseModelJsonOrFallback(completion.choices[0]?.message.content || "{}", (raw, parseError) => ({
      overallDriftRisk: "medium",
      summary: raw,
      voiceDrift: [],
      factDrift: [],
      timelineDrift: [],
      characterDrift: [],
      motifDrift: [],
      theologyWorldviewDrift: [],
      overExpansionWarnings: [],
      recommendedActions: [],
      parseWarning: parseError,
    }));
    const content = {
      ...(typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : { summary: String(parsed) }),
      revisionJobId,
      checkedAt: new Date().toISOString(),
      sampleCount: revisionSamples.length,
      modelSelection,
    };

    const { data: report, error: insertError } = await supabase
      .from("coherence_reports")
      .insert({
        book_id: bookId,
        report_type: "rewrite_drift_check",
        content,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    return NextResponse.json({ content: { ...content, reportId: report?.id || null } });
  } catch (error) {
    console.error("Rewrite drift check failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function getLatestRewriteJobId(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string) {
  const { data, error } = await supabase
    .from("revision_jobs")
    .select("id")
    .eq("book_id", bookId)
    .eq("mode", "full_book_rewrite")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
