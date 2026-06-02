import { NextResponse } from "next/server";
import { z } from "zod";
import { buildJobProgress, createRevisionJobHeartbeat, getRevisionJobStatus, updateRevisionJobProgress, waitWhileRevisionJobPaused } from "@/lib/ai/job-state";
import { criticLenses } from "@/lib/critic/prompts";
import { runCriticLens } from "@/lib/critic/run";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { createClient } from "@/lib/supabase/server";
import type { CriticLens } from "@/lib/types";

const schema = z.object({
  stage: z.enum(["baseline", "post_rewrite"]).default("post_rewrite"),
  jobId: z.string().uuid().optional(),
  serverManaged: z.boolean().optional(),
});

function getErrorMessage(error: unknown) {
  const lmStudioMessage = getLmStudioErrorMessage(error, "");
  if (lmStudioMessage) return lmStudioMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "BookForge Critic batch failed.";
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const body = schema.parse(await readJsonBody(request));
    const stage = body.stage;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const lenses = Object.keys(criticLenses) as CriticLens[];
    const startedAt = new Date().toISOString();
    let jobId = body.jobId || "";
    let jobStatus = "running";
    let batchStage = stage;
    let jobSettings: unknown = { stage: batchStage, unit: "critic_lens" };

    if (jobId) {
      const { data: existingJob, error: existingJobError } = await supabase
        .from("revision_jobs")
        .select("id,status,settings")
        .eq("id", jobId)
        .eq("book_id", bookId)
        .eq("created_by", user.id)
        .single();
      if (existingJobError) throw existingJobError;
      if (!existingJob) return NextResponse.json({ error: "Critic batch job not found." }, { status: 404 });
      if (existingJob.status === "completed") return NextResponse.json({ ok: true, message: "Critic batch job already completed." });
      if (existingJob.status === "failed") return NextResponse.json({ ok: true, message: "Critic batch job already failed." });
      jobStatus = String(existingJob.status || "running");
      jobSettings = existingJob.settings || jobSettings;
      if (jobSettings && typeof jobSettings === "object" && "stage" in jobSettings) {
        const persistedStage = String((jobSettings as { stage?: unknown }).stage || "");
        if (persistedStage === "baseline" || persistedStage === "post_rewrite") {
          batchStage = persistedStage;
        }
      }
    } else {
      const status = body.serverManaged ? "queued" : "running";
      const { data: job, error: jobError } = await supabase
        .from("revision_jobs")
        .insert({
          book_id: bookId,
          mode: "bookforge_critic_batch",
          status,
          settings: {
            stage: batchStage,
            unit: "critic_lens",
            progress: buildJobProgress({
              taskName: "Run all BookForge Critic lenses",
              currentUnit: `Critic lens 1 of ${lenses.length}`,
              totalUnits: lenses.length,
              attempted: 0,
              successful: 0,
              failed: 0,
              skipped: 0,
              startedAt,
              estimatedSecondsPerUnit: 35,
            }),
          },
          prompt_snapshot: "BookForge Critic batch: all prebuilt lenses.",
          created_by: user.id,
          started_at: status === "running" ? startedAt : null,
        })
        .select("id")
        .single();
      if (jobError) throw jobError;
      jobId = job.id;
      jobStatus = status;

      if (body.serverManaged) {
        return NextResponse.json({ content: { jobId, queued: true, totalUnits: lenses.length } });
      }
    }

    if (jobStatus !== "running") {
      await supabase
        .from("revision_jobs")
        .update({ status: "running", started_at: startedAt })
        .eq("id", jobId)
        .eq("book_id", bookId)
        .eq("created_by", user.id);
    }

    const results: Array<{ lens: CriticLens; score: unknown }> = [];
    let attempted = 0;
    let failed = 0;
    for (const [index, lens] of lenses.entries()) {
      const pauseStatus = await waitWhileRevisionJobPaused(supabase, jobId);
      if (pauseStatus === "cancelled") break;
      const currentStatus = await getRevisionJobStatus(supabase, jobId);
      if (currentStatus === "cancelled") break;

      attempted += 1;
      jobSettings = await updateRevisionJobProgress(supabase, jobId, jobSettings, {
        currentUnit: `${criticLenses[lens].label} (${index + 1}/${lenses.length})`,
        totalUnits: lenses.length,
        attempted,
        successful: results.length,
        failed,
        skipped: 0,
      });
      const heartbeat = createRevisionJobHeartbeat(supabase, jobId, jobSettings, {
        currentUnit: `${criticLenses[lens].label} (${index + 1}/${lenses.length})`,
        totalUnits: lenses.length,
        attempted,
        successful: results.length,
        failed,
        skipped: 0,
      });
      try {
        const content = await runCriticLens({ supabase, bookId, userId: user.id, lens, stage: batchStage });
        results.push({ lens, score: content.score });
        jobSettings = await updateRevisionJobProgress(supabase, jobId, jobSettings, {
          currentUnit: index + 1 >= lenses.length ? "Finalizing critic batch" : `Critic lens ${index + 2} of ${lenses.length}`,
          totalUnits: lenses.length,
          attempted,
          successful: results.length,
          failed,
          skipped: 0,
          failedUnits: [],
        });
      } catch (criticError) {
        failed += 1;
        const message = getErrorMessage(criticError);
        await updateRevisionJobProgress(supabase, jobId, jobSettings, {
          currentUnit: `Failed at ${criticLenses[lens].label}`,
          totalUnits: lenses.length,
          attempted,
          successful: results.length,
          failed,
          skipped: 0,
          message,
          failedUnits: [{ id: lens, type: "critic_lens", label: criticLenses[lens].label, error: message }],
        });
        throw criticError;
      } finally {
        heartbeat.stop();
      }
    }

    await supabase.from("coherence_reports").insert({
      book_id: bookId,
      report_type: batchStage === "post_rewrite" ? "critic_post_batch" : "critic_batch",
      content: {
        stage: batchStage,
        completedAt: new Date().toISOString(),
        results,
      },
    });

    const completedAt = new Date().toISOString();
    const finalStatus = await getRevisionJobStatus(supabase, jobId);
    const completedStatus = finalStatus === "cancelled" ? "cancelled" : "completed";
    const { error: finalJobError } = await supabase
      .from("revision_jobs")
      .update({
        status: completedStatus,
        completed_at: completedAt,
        settings: {
          stage: batchStage,
          unit: "critic_lens",
          progress: buildJobProgress({
            taskName: "Run all BookForge Critic lenses",
            currentUnit: completedStatus === "cancelled" ? "Cancelled" : "Complete",
            totalUnits: lenses.length,
            attempted,
            successful: results.length,
            failed,
            skipped: completedStatus === "cancelled" ? Math.max(0, lenses.length - attempted) : 0,
            failedUnits: [],
            startedAt,
            completedAt,
            estimatedSecondsPerUnit: 35,
            message:
              completedStatus === "cancelled"
                ? "Critic batch cancelled. Completed reports were saved."
                : "All BookForge Critic reports saved.",
          }),
        },
      })
      .eq("id", jobId);
    if (finalJobError) throw finalJobError;

    return NextResponse.json({ content: { stage: batchStage, completed: results.length, results } });
  } catch (error) {
    console.error("BookForge Critic batch failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
