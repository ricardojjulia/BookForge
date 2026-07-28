import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildJobProgress,
  createRevisionJobHeartbeat,
  getRevisionJobStatus,
  updateRevisionJobProgress,
  waitWhileRevisionJobPaused,
} from "@/lib/ai/job-state";
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
  jobId: z.string().uuid().optional(),
  serverManaged: z.boolean().optional(),
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

    const startedAt = new Date().toISOString();
    const totalUnits = 1;
    let durableJobId = body.jobId || "";
    let durableJobStatus = "running";
    let durableSettings: unknown = {
      unit: "drift_check",
      revisionJobId: body.revisionJobId || null,
      progress: buildJobProgress({
        taskName: "Run rewrite drift check",
        currentUnit: "Preparing drift-check samples",
        totalUnits,
        attempted: 1,
        successful: 0,
        failed: 0,
        skipped: 0,
        startedAt,
        estimatedSecondsPerUnit: 25,
      }),
    };

    if (durableJobId) {
      const { data: existingJob, error: existingJobError } = await supabase
        .from("revision_jobs")
        .select("id,status,settings")
        .eq("id", durableJobId)
        .eq("book_id", bookId)
        .eq("created_by", user.id)
        .single();
      if (existingJobError) throw existingJobError;
      if (!existingJob) return NextResponse.json({ error: "Drift-check job not found." }, { status: 404 });
      if (existingJob.status === "completed") return NextResponse.json({ ok: true, message: "Drift-check job already completed." });
      if (existingJob.status === "failed") return NextResponse.json({ ok: true, message: "Drift-check job already failed." });
      durableJobStatus = String(existingJob.status || "running");
      durableSettings = existingJob.settings || durableSettings;
    } else {
      const status = body.serverManaged ? "queued" : "running";
      const { data: createdJob, error: createdJobError } = await supabase
        .from("revision_jobs")
        .insert({
          book_id: bookId,
          mode: "rewrite_drift_check",
          status,
          settings: {
            unit: "drift_check",
            revisionJobId: body.revisionJobId || null,
            progress: buildJobProgress({
              taskName: "Run rewrite drift check",
              currentUnit: status === "queued" ? "Queued" : "Preparing drift-check samples",
              totalUnits,
              attempted: 1,
              successful: 0,
              failed: 0,
              skipped: 0,
              startedAt: status === "running" ? startedAt : null,
              estimatedSecondsPerUnit: 25,
            }),
          },
          prompt_snapshot: "Rewrite drift-check pass.",
          created_by: user.id,
          started_at: status === "running" ? startedAt : null,
        })
        .select("id")
        .single();
      if (createdJobError) throw createdJobError;
      durableJobId = createdJob.id;
      durableJobStatus = status;

      if (body.serverManaged) {
        return NextResponse.json({ content: { jobId: durableJobId, queued: true, totalUnits } });
      }
    }

    if (durableJobStatus !== "running") {
      await supabase
        .from("revision_jobs")
        .update({ status: "running", started_at: startedAt })
        .eq("id", durableJobId)
        .eq("book_id", bookId)
        .eq("created_by", user.id);
    }

    const pauseStatus = await waitWhileRevisionJobPaused(supabase, durableJobId);
    if (pauseStatus === "cancelled") {
      const completedAt = new Date().toISOString();
      await supabase
        .from("revision_jobs")
        .update({
          status: "cancelled",
          completed_at: completedAt,
          settings: {
            unit: "drift_check",
            revisionJobId: body.revisionJobId || null,
            progress: buildJobProgress({
              taskName: "Run rewrite drift check",
              currentUnit: "Cancelled",
              totalUnits,
              attempted: 0,
              successful: 0,
              failed: 0,
              skipped: 1,
              startedAt,
              completedAt,
              estimatedSecondsPerUnit: 25,
              message: "Drift check cancelled before execution started.",
            }),
          },
        })
        .eq("id", durableJobId);
      return NextResponse.json({ ok: true, message: "Drift-check job cancelled." });
    }

    durableSettings = await updateRevisionJobProgress(supabase, durableJobId, durableSettings, {
      currentUnit: "Running drift-check model pass",
      totalUnits,
      attempted: 1,
      successful: 0,
      failed: 0,
      skipped: 0,
    });

    const heartbeat = createRevisionJobHeartbeat(supabase, durableJobId, durableSettings, {
      currentUnit: "Running drift-check model pass",
      totalUnits,
      attempted: 1,
      successful: 0,
      failed: 0,
      skipped: 0,
    });

    try {
      const revisionJobId = body.revisionJobId || (await getLatestRewriteJobId(supabase, bookId));
      if (!revisionJobId) {
        const completedAt = new Date().toISOString();
        await supabase
          .from("revision_jobs")
          .update({
            status: "completed",
            completed_at: completedAt,
            settings: {
              unit: "drift_check",
              revisionJobId: null,
              progress: buildJobProgress({
                taskName: "Run rewrite drift check",
                currentUnit: "Skipped",
                totalUnits,
                attempted: 1,
                successful: 0,
                failed: 0,
                skipped: 1,
                startedAt,
                completedAt,
                estimatedSecondsPerUnit: 25,
                message: "No rewrite job found — drift check skipped.",
              }),
            },
          })
          .eq("id", durableJobId);
        return NextResponse.json({ skipped: true, reason: "No rewrite job found — drift check skipped." });
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
        const completedAt = new Date().toISOString();
        await supabase
          .from("revision_jobs")
          .update({
            status: "completed",
            completed_at: completedAt,
            settings: {
              unit: "drift_check",
              revisionJobId,
              progress: buildJobProgress({
                taskName: "Run rewrite drift check",
                currentUnit: "Skipped",
                totalUnits,
                attempted: 1,
                successful: 0,
                failed: 0,
                skipped: 1,
                startedAt,
                completedAt,
                estimatedSecondsPerUnit: 25,
                message: "No new revision samples to check — drift check skipped.",
              }),
            },
          })
          .eq("id", durableJobId);
        return NextResponse.json({ skipped: true, reason: "No new revision samples to check — drift check skipped." });
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
      });

      const parsed = parseModelJsonOrFallback(completion.choices[0]?.message.content || "{}", (raw, parseError) => ({
        overallDriftRisk: "medium",
        summary: raw,
        voiceDrift: [],
        factDrift: [],
        timelineDrift: [],
        characterDrift: [],
        motifDrift: [],
        contemporaryViewDrift: [],
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

      const completedAt = new Date().toISOString();
      const finalStatus = await getRevisionJobStatus(supabase, durableJobId);
      const completedStatus = finalStatus === "cancelled" ? "cancelled" : "completed";
      await supabase
        .from("revision_jobs")
        .update({
          status: completedStatus,
          completed_at: completedAt,
          settings: {
            unit: "drift_check",
            revisionJobId,
            progress: buildJobProgress({
              taskName: "Run rewrite drift check",
              currentUnit: completedStatus === "cancelled" ? "Cancelled" : "Complete",
              totalUnits,
              attempted: 1,
              successful: completedStatus === "cancelled" ? 0 : 1,
              failed: 0,
              skipped: completedStatus === "cancelled" ? 1 : 0,
              startedAt,
              completedAt,
              estimatedSecondsPerUnit: 25,
              message:
                completedStatus === "cancelled"
                  ? "Drift-check cancelled during execution."
                  : "Rewrite drift-check report saved.",
            }),
          },
        })
        .eq("id", durableJobId);

      return NextResponse.json({ content: { ...content, reportId: report?.id || null }, revisionJobId: durableJobId });
    } catch (runError) {
      const completedAt = new Date().toISOString();
      const message = getErrorMessage(runError);
      await supabase
        .from("revision_jobs")
        .update({
          status: "failed",
          completed_at: completedAt,
          error_message: message,
          settings: {
            unit: "drift_check",
            revisionJobId: body.revisionJobId || null,
            progress: buildJobProgress({
              taskName: "Run rewrite drift check",
              currentUnit: "Failed",
              totalUnits,
              attempted: 1,
              successful: 0,
              failed: 1,
              skipped: 0,
              startedAt,
              completedAt,
              estimatedSecondsPerUnit: 25,
              message,
            }),
          },
        })
        .eq("id", durableJobId);
      throw runError;
    } finally {
      heartbeat.stop();
    }
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
