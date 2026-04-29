import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  confirmation: z.literal("RESET REWRITE"),
});

const rewriteReportTypes = [
  "rewrite_execution",
  "rewrite_drift_check",
  "continuity_ledger",
  "humanized_guidance",
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to reset rewrite work.";
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const [{ count: versionCount }, { count: jobCount }, { count: acceptedCount }] = await Promise.all([
      supabase.from("revision_versions").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase
        .from("revision_jobs")
        .select("id", { count: "exact", head: true })
        .eq("book_id", bookId)
        .eq("mode", "full_book_rewrite"),
      supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId).not("accepted_text", "is", null),
    ]);

    const now = new Date().toISOString();

    const { error: paragraphError } = await supabase
      .from("paragraphs")
      .update({
        current_text: null,
        accepted_text: null,
        updated_at: now,
      })
      .eq("book_id", bookId);
    if (paragraphError) throw paragraphError;

    const { error: sceneError } = await supabase
      .from("scenes")
      .update({
        current_text: null,
        accepted_text: null,
        status: "pending",
        updated_at: now,
      })
      .eq("book_id", bookId);
    if (sceneError) throw sceneError;

    const { error: chapterError } = await supabase
      .from("chapters")
      .update({
        current_text: null,
        accepted_text: null,
        updated_at: now,
      })
      .eq("book_id", bookId);
    if (chapterError) throw chapterError;

    const { error: versionsError } = await supabase.from("revision_versions").delete().eq("book_id", bookId);
    if (versionsError) throw versionsError;

    const { error: jobsError } = await supabase
      .from("revision_jobs")
      .delete()
      .eq("book_id", bookId)
      .eq("mode", "full_book_rewrite");
    if (jobsError) throw jobsError;

    const { error: reportError } = await supabase
      .from("coherence_reports")
      .delete()
      .eq("book_id", bookId)
      .or(
        [
          ...rewriteReportTypes.map((type) => `report_type.eq.${type}`),
          "report_type.like.rewrite_%",
          "report_type.eq.continuity_ledger",
        ].join(","),
      );
    if (reportError) throw reportError;

    return NextResponse.json({
      content: {
        reset: true,
        deletedRevisionVersions: versionCount || 0,
        deletedRewriteJobs: jobCount || 0,
        clearedAcceptedParagraphs: acceptedCount || 0,
      },
    });
  } catch (error) {
    console.error("Rewrite reset failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
