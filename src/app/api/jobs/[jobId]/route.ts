import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  action: z.enum(["pause", "resume", "cancel", "mark_failed"]),
});

function getError(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const candidate = e as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.error, candidate.details, candidate.hint]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
    if (parts.length > 0) {
      const suffix = typeof candidate.code === "string" && candidate.code.trim() ? ` (code: ${candidate.code.trim()})` : "";
      return `${parts.join(" | ")}${suffix}`;
    }
  }
  return "Unable to update job.";
}

function statusForAction(action: z.infer<typeof schema>["action"]) {
  if (action === "pause") return "paused";
  if (action === "resume") return "running";
  if (action === "mark_failed") return "failed";
  return "cancelled";
}

export async function PATCH(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const status = statusForAction(body.action);
    const update: Record<string, unknown> = { status };
    if (status === "running") update.started_at = new Date().toISOString();
    if (status === "cancelled" || status === "failed") update.completed_at = new Date().toISOString();
    if (status === "failed") update.error_message = "Marked failed after stale or interrupted progress.";

    const { data, error } = await supabase
      .from("revision_jobs")
      .update(update)
      .eq("id", jobId)
      .select("id,status")
      .maybeSingle();
    if (error) throw error;

    if (data) {
      return NextResponse.json({ content: data });
    }

    // Fallback: support control actions for auto-review jobs via the same endpoint.
    if (body.action === "pause") {
      return NextResponse.json(
        { error: "Pause is not supported for auto-review jobs. Use cancel or resume." },
        { status: 400 },
      );
    }

    const autoReviewUpdate: Record<string, unknown> = { status };
    if (status === "running") {
      autoReviewUpdate.completed_at = null;
      autoReviewUpdate.error = null;
    }
    if (status === "cancelled" || status === "failed") {
      autoReviewUpdate.completed_at = new Date().toISOString();
    }
    if (status === "failed") {
      autoReviewUpdate.error = "Marked failed after stale or interrupted progress.";
    }

    const { data: autoReviewData, error: autoReviewError } = await supabase
      .from("auto_review_jobs")
      .update(autoReviewUpdate)
      .eq("id", jobId)
      .eq("user_id", user.id)
      .select("id,status")
      .maybeSingle();
    if (autoReviewError) throw autoReviewError;

    if (!autoReviewData) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    return NextResponse.json({ content: autoReviewData });
  } catch (error) {
    console.error("Job control failed", error);
    return NextResponse.json({ error: getError(error) }, { status: 500 });
  }
}
