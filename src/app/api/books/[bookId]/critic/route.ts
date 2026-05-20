import { NextResponse } from "next/server";
import { z } from "zod";
import { buildJobProgress } from "@/lib/ai/job-state";
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
    ])
    .default("revision_priorities"),
  stage: z.enum(["baseline", "post_rewrite"]).default("baseline"),
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
    const { lens, stage } = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const startedAt = new Date().toISOString();
    const { data: job, error: jobError } = await supabase
      .from("revision_jobs")
      .insert({
        book_id: bookId,
        mode: "bookforge_critic",
        status: "running",
        settings: {
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
        },
        prompt_snapshot: `BookForge Critic lens: ${lens}`,
        created_by: user.id,
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (jobError) throw jobError;

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
        .eq("id", job.id);
      throw criticError;
    }

    const completedAt = new Date().toISOString();
    const { error: finalJobError } = await supabase
      .from("revision_jobs")
      .update({
        status: "completed",
        completed_at: completedAt,
        settings: {
          lens,
          stage,
          unit: "critic_lens",
          progress: buildJobProgress({
            taskName: `BookForge Critic: ${criticLenses[lens].label}`,
            currentUnit: "Complete",
            totalUnits: 1,
            attempted: 1,
            successful: 1,
            failed: 0,
            skipped: 0,
            startedAt,
            completedAt,
            estimatedSecondsPerUnit: 35,
            message: "BookForge Critic report saved.",
          }),
        },
      })
      .eq("id", job.id);
    if (finalJobError) throw finalJobError;

    return NextResponse.json({ content });
  } catch (error) {
    console.error("BookForge Critic failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
