import { NextResponse } from "next/server";
import { markBookRevising } from "@/lib/books/status";
import { createClient } from "@/lib/supabase/server";

type ParagraphRow = {
  id: string;
  book_id: string;
  is_locked: boolean | null;
};

type RevisionRow = {
  id: string;
  book_id: string;
  paragraph_id: string | null;
  revised_text: string;
  created_at: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to accept chapter revisions.";
}

export async function PATCH(_request: Request, context: { params: Promise<{ chapterId: string }> }) {
  try {
    const { chapterId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: paragraphs, error: paragraphsError } = await supabase
      .from("paragraphs")
      .select("id,book_id,is_locked")
      .eq("chapter_id", chapterId);
    if (paragraphsError) throw paragraphsError;

    const paragraphRows = (paragraphs || []) as ParagraphRow[];
    const paragraphIds = paragraphRows.filter((paragraph) => !paragraph.is_locked).map((paragraph) => paragraph.id);
    if (!paragraphIds.length) {
      return NextResponse.json({ content: { accepted: 0, skippedLocked: paragraphRows.length } });
    }

    const { data: revisions, error: revisionsError } = await supabase
      .from("revision_versions")
      .select("id,book_id,paragraph_id,revised_text,created_at")
      .in("paragraph_id", paragraphIds)
      .eq("rejected", false)
      .order("created_at", { ascending: false });
    if (revisionsError) throw revisionsError;

    const latestByParagraph = ((revisions || []) as RevisionRow[]).reduce<Record<string, RevisionRow>>((latest, revision) => {
      if (revision.paragraph_id && !latest[revision.paragraph_id]) latest[revision.paragraph_id] = revision;
      return latest;
    }, {});
    const latestRevisions = Object.values(latestByParagraph);
    if (!latestRevisions.length) {
      return NextResponse.json({ content: { accepted: 0, skippedLocked: paragraphRows.length - paragraphIds.length } });
    }

    for (const revision of latestRevisions) {
      if (!revision.paragraph_id) continue;

      const { error: clearError } = await supabase
        .from("revision_versions")
        .update({ accepted: false, rejected: true })
        .eq("paragraph_id", revision.paragraph_id)
        .eq("book_id", revision.book_id);
      if (clearError) throw clearError;

      const { error: paragraphError } = await supabase
        .from("paragraphs")
        .update({
          accepted_text: revision.revised_text,
          current_text: revision.revised_text,
          updated_at: new Date().toISOString(),
        })
        .eq("id", revision.paragraph_id);
      if (paragraphError) throw paragraphError;

      const { error: acceptError } = await supabase
        .from("revision_versions")
        .update({ accepted: true, rejected: false })
        .eq("id", revision.id);
      if (acceptError) throw acceptError;
    }

    const bookId = paragraphRows[0]?.book_id || latestRevisions[0]?.book_id;
    if (bookId) {
      await supabase.from("coherence_reports").insert({
        book_id: bookId,
        report_type: "continuity_ledger",
        content: {
          event: "chapter_latest_revisions_accepted",
          chapterId,
          acceptedAt: new Date().toISOString(),
          acceptedCount: latestRevisions.length,
          note: "Latest non-rejected drafts in this chapter became active paragraph text. Locked paragraphs were skipped.",
        },
      });
      await markBookRevising(supabase, bookId);
    }

    return NextResponse.json({
      content: {
        accepted: latestRevisions.length,
        skippedLocked: paragraphRows.length - paragraphIds.length,
      },
    });
  } catch (error) {
    console.error("Accept chapter revisions failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
