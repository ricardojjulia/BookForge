import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  mode: z.enum(["chooser", "wizard", "manual"]).optional(),
  currentStep: z.number().int().min(1).max(7).optional(),
  strategyApproved: z.boolean().optional(),
  sampleRevisionJobId: z.string().uuid().nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  lastDriftReportId: z.string().uuid().nullable().optional(),
  postCriticCompleted: z.boolean().optional(),
  exportReady: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to save rewrite workflow.";
}

export async function PATCH(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    let nextMetadata = body.metadata;
    if (body.metadata) {
      const { data: existing } = await supabase
        .from("rewrite_workflows")
        .select("metadata")
        .eq("book_id", bookId)
        .maybeSingle();
      const existingMetadata =
        existing?.metadata && typeof existing.metadata === "object" ? (existing.metadata as Record<string, unknown>) : {};
      nextMetadata = {
        ...existingMetadata,
        ...body.metadata,
      };
    }

    const update: Record<string, unknown> = {
      book_id: bookId,
      owner_id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (body.mode) update.mode = body.mode;
    if (body.currentStep) update.current_step = body.currentStep;
    if (typeof body.strategyApproved === "boolean") update.strategy_approved = body.strategyApproved;
    if ("sampleRevisionJobId" in body) update.sample_revision_job_id = body.sampleRevisionJobId || null;
    if ("campaignId" in body) update.campaign_id = body.campaignId || null;
    if ("lastDriftReportId" in body) update.last_drift_report_id = body.lastDriftReportId || null;
    if (typeof body.postCriticCompleted === "boolean") update.post_critic_completed = body.postCriticCompleted;
    if (typeof body.exportReady === "boolean") update.export_ready = body.exportReady;
    if (nextMetadata) update.metadata = nextMetadata;

    const { data, error } = await supabase
      .from("rewrite_workflows")
      .upsert(update, { onConflict: "book_id" })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ content: { workflow: data } });
  } catch (error) {
    console.error("Save rewrite workflow failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
