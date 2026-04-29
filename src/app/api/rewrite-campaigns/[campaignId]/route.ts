import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  action: z.enum(["pause", "resume", "cancel", "complete", "fail", "update_settings"]),
  batchSize: z.number().int().positive().max(5000).optional(),
  goal: z.enum(["sample_all_chapters", "full_coverage", "custom"]).optional(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to update rewrite campaign.";
}

export async function PATCH(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  try {
    const { campaignId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.action === "pause") update.status = "paused";
    if (body.action === "resume") update.status = "active";
    if (body.action === "cancel") {
      update.status = "cancelled";
      update.completed_at = new Date().toISOString();
    }
    if (body.action === "complete") {
      update.status = "completed";
      update.completed_at = new Date().toISOString();
    }
    if (body.action === "fail") update.status = "failed";
    if (body.action === "update_settings") {
      if (body.batchSize) update.batch_size = body.batchSize;
      if (body.goal) update.goal = body.goal;
    }

    const { data, error } = await supabase
      .from("rewrite_campaigns")
      .update(update)
      .eq("id", campaignId)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ content: { campaign: data } });
  } catch (error) {
    console.error("Update rewrite campaign failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
