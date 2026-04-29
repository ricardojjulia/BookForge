import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  action: z.enum(["pause", "resume", "cancel", "mark_failed"]),
});

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
      .single();
    if (error) throw error;

    return NextResponse.json({ content: data });
  } catch (error) {
    console.error("Job control failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update job." }, { status: 500 });
  }
}
