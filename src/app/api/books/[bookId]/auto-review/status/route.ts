import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Auto Review status check failed.";
}

export async function GET(_: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const [
      { data: bible, error: bibleError },
      { count: chapterCount, error: chapterCountError },
      { count: summarizedChapterCount, error: summarizedChapterCountError },
      { data: reports, error: reportsError },
      { count: pendingRevisionCount, error: pendingRevisionError },
      { count: revisionCount, error: revisionError },
    ] = await Promise.all([
      supabase.from("book_bibles").select("book_id").eq("book_id", bookId).maybeSingle(),
      supabase.from("chapters").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase
        .from("chapters")
        .select("id", { count: "exact", head: true })
        .eq("book_id", bookId)
        .not("summary", "is", null),
      supabase
        .from("coherence_reports")
        .select("report_type,created_at")
        .eq("book_id", bookId)
        .in("report_type", ["critic_batch", "critic_post_batch", "rewrite_plan", "auto_revision_decisions"]),
      supabase
        .from("revision_versions")
        .select("id", { count: "exact", head: true })
        .eq("book_id", bookId)
        .eq("accepted", false)
        .eq("rejected", false),
      supabase.from("revision_versions").select("id", { count: "exact", head: true }).eq("book_id", bookId),
    ]);

    if (bibleError) throw bibleError;
    if (chapterCountError) throw chapterCountError;
    if (summarizedChapterCountError) throw summarizedChapterCountError;
    if (reportsError) throw reportsError;
    if (pendingRevisionError) throw pendingRevisionError;
    if (revisionError) throw revisionError;

    const reportTypes = new Set((reports || []).map((report) => report.report_type));
    const chapters = chapterCount || 0;
    const summarized = summarizedChapterCount || 0;

    return NextResponse.json({
      content: {
        hasBlueprint: Boolean(bible),
        hasChapterSummaries: chapters === 0 || summarized >= chapters,
        chapterCount: chapters,
        summarizedChapterCount: summarized,
        hasBaselineCriticBatch: reportTypes.has("critic_batch"),
        hasRewritePlan: reportTypes.has("rewrite_plan"),
        hasAutoRevisionDecisions: reportTypes.has("auto_revision_decisions"),
        hasPostRewriteCriticBatch: reportTypes.has("critic_post_batch"),
        pendingRevisionCount: pendingRevisionCount || 0,
        revisionCount: revisionCount || 0,
      },
    });
  } catch (error) {
    console.error("Auto Review status check failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
