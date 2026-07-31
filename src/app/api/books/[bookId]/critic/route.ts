import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildJobProgress,
  createRevisionJobHeartbeat,
  getRevisionJobStatus,
  updateRevisionJobProgress,
  waitWhileRevisionJobPaused,
} from "@/lib/ai/job-state";
import { criticLenses } from "@/lib/critic/prompts";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { runCriticLens } from "@/lib/critic/run";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  lens: z
    .enum([
      "story_structure",
      "prose_quality",
      "continuity",
      "character_depth",
      "market_fit",
      "contemporary_view",
      "revision_priorities",
      "dialogue_density",
    ])
    .default("revision_priorities"),
  stage: z.enum(["baseline", "post_rewrite"]).default("baseline"),
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
  return "BookForge Critic failed.";
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const { lens, stage, jobId: requestedJobId, serverManaged } = schema.parse(await readJsonBody(request));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const startedAt = new Date().toISOString();
    let jobId = requestedJobId || "";
    let jobStatus = "running";
    let jobSettings: unknown = {
      lens,
      stage,
      unit: "critic_lens",
      progress: buildJobProgress({
        taskName: `BookForge Critic: ${criticLenses[lens].label}`,
        currentUnit: "Running selected critic lens",
        totalUnits: 1,
        attempted: 1,
        successful: 0,
        failed: 0,
        skipped: 0,
        startedAt,
        estimatedSecondsPerUnit: 35,
      }),
    };

    if (jobId) {
      const { data: existingJob, error: existingJobError } = await supabase
        .from("revision_jobs")
        .select("id,status,settings")
        .eq("id", jobId)
        .eq("book_id", bookId)
        .eq("created_by", user.id)
        .single();
      if (existingJobError) throw existingJobError;
      if (!existingJob) return NextResponse.json({ error: "Critic job not found." }, { status: 404 });
      if (existingJob.status === "completed") return NextResponse.json({ ok: true, message: "Critic job already completed." });
      if (existingJob.status === "failed") return NextResponse.json({ ok: true, message: "Critic job already failed." });
      jobStatus = String(existingJob.status || "running");
      jobSettings = existingJob.settings || jobSettings;
    } else {
      const status = serverManaged ? "queued" : "running";
      const { data: createdJob, error: createdJobError } = await supabase
        .from("revision_jobs")
        .insert({
          book_id: bookId,
          mode: "bookforge_critic",
          status,
          settings: {
            lens,
            stage,
            unit: "critic_lens",
            progress: buildJobProgress({
              taskName: `BookForge Critic: ${criticLenses[lens].label}`,
              currentUnit: status === "queued" ? "Queued" : "Running selected critic lens",
              totalUnits: 1,
              attempted: 1,
              successful: 0,
              failed: 0,
              skipped: 0,
              startedAt: status === "running" ? startedAt : null,
              estimatedSecondsPerUnit: 35,
            }),
          },
          prompt_snapshot: `BookForge Critic lens: ${lens}`,
          created_by: user.id,
          started_at: status === "running" ? startedAt : null,
        })
        .select("id")
        .single();
      if (createdJobError) throw createdJobError;
      jobId = createdJob.id;
      jobStatus = status;

      if (serverManaged) {
        return NextResponse.json({ content: { jobId, queued: true, totalUnits: 1 } });
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

    const pauseStatus = await waitWhileRevisionJobPaused(supabase, jobId);
    if (pauseStatus === "cancelled") {
      const completedAt = new Date().toISOString();
      await supabase
        .from("revision_jobs")
        .update({
          status: "cancelled",
          completed_at: completedAt,
          settings: {
            lens,
            stage,
            unit: "critic_lens",
            progress: buildJobProgress({
              taskName: `BookForge Critic: ${criticLenses[lens].label}`,
              currentUnit: "Cancelled",
              totalUnits: 1,
              attempted: 0,
              successful: 0,
              failed: 0,
              skipped: 1,
              startedAt,
              completedAt,
              estimatedSecondsPerUnit: 35,
              message: "Critic run cancelled before execution started.",
            }),
          },
        })
        .eq("id", jobId);
      return NextResponse.json({ ok: true, message: "Critic job cancelled." });
    }

    jobSettings = await updateRevisionJobProgress(supabase, jobId, jobSettings, {
      currentUnit: "Running selected critic lens",
      totalUnits: 1,
      attempted: 1,
      successful: 0,
      failed: 0,
      skipped: 0,
    });

    const heartbeat = createRevisionJobHeartbeat(supabase, jobId, jobSettings, {
      currentUnit: "Running selected critic lens",
      totalUnits: 1,
      attempted: 1,
      successful: 0,
      failed: 0,
      skipped: 0,
    });

    let content;
    try {
      content = await runCriticLens({ supabase, bookId, userId: user.id, lens, stage });
    } catch (criticError) {
      const message = getErrorMessage(criticError);
      await supabase
        .from("revision_jobs")
        .update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
          settings: {
            lens,
            stage,
            unit: "critic_lens",
            progress: buildJobProgress({
              taskName: `BookForge Critic: ${criticLenses[lens].label}`,
              currentUnit: "Failed",
              totalUnits: 1,
              attempted: 1,
              successful: 0,
              failed: 1,
              skipped: 0,
              failedUnits: [{ id: lens, type: "critic_lens", label: criticLenses[lens].label, error: message }],
              startedAt,
              completedAt: new Date().toISOString(),
              estimatedSecondsPerUnit: 35,
              message,
            }),
          },
        })
        .eq("id", jobId);
      throw criticError;
    } finally {
      heartbeat.stop();
    }

    const completedAt = new Date().toISOString();
    const finalStatus = await getRevisionJobStatus(supabase, jobId);
    const completedStatus = finalStatus === "cancelled" ? "cancelled" : "completed";
    const { error: finalJobError } = await supabase
      .from("revision_jobs")
      .update({
        status: completedStatus,
        completed_at: completedAt,
        settings: {
          lens,
          stage,
          unit: "critic_lens",
          progress: buildJobProgress({
            taskName: `BookForge Critic: ${criticLenses[lens].label}`,
            currentUnit: completedStatus === "cancelled" ? "Cancelled" : "Complete",
            totalUnits: 1,
            attempted: 1,
            successful: completedStatus === "cancelled" ? 0 : 1,
            failed: 0,
            skipped: completedStatus === "cancelled" ? 1 : 0,
            startedAt,
            completedAt,
            estimatedSecondsPerUnit: 35,
            message:
              completedStatus === "cancelled"
                ? "Critic run cancelled during execution."
                : "BookForge Critic report saved.",
          }),
        },
      })
      .eq("id", jobId);
    if (finalJobError) throw finalJobError;

    return NextResponse.json({ content, revisionJobId: jobId });
  } catch (error) {
    console.error("BookForge Critic failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
