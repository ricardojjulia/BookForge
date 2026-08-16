import { NextResponse } from "next/server";
import { z } from "zod";
import { criticLenses } from "@/lib/critic/prompts";
import { renumberChapters } from "@/lib/manuscript/renumber-chapters";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  title: z.string().max(300).nullable().optional(),
  sectionType: z.enum(["front_matter", "body", "back_matter"]).optional(),
  excludeFromRewrite: z.boolean().optional(),
  excludeFromExport: z.boolean().optional(),
  structureNotes: z.string().max(2000).nullable().optional(),
  clearSummary: z.boolean().default(true),
  // Set when this save follows a content-changing structure repair (merge,
  // expand, shorten, regenerate) in the same modal session — every one of
  // these book-wide evaluations was built from the manuscript as it existed
  // before the repair, so they're stale the moment chapter content changes.
  invalidateBookEvaluations: z.boolean().optional().default(false),
});

// Book-wide evaluations invalidated by a structural chapter repair. Does NOT
// include per-paragraph revision history (revision_versions) or the
// Manuscript Blueprint (book_bibles) — those aren't nuked by fixing one
// chapter's length/boundaries.
const STALE_REPORT_TYPES = [
  ...Object.keys(criticLenses).map((lens) => `critic:${lens}`),
  ...Object.keys(criticLenses).map((lens) => `critic_post:${lens}`),
  "critic_batch",
  "critic_post_batch",
  "rewrite_plan",
  "rewrite_drift_check",
  "continuity_ledger",
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to update chapter.";
}

export async function DELETE(_: Request, context: { params: Promise<{ chapterId: string }> }) {
  try {
    const { chapterId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: chapter, error: fetchError } = await supabase
      .from("chapters")
      .select("id,book_id,books(owner_id)")
      .eq("id", chapterId)
      .single();
    if (fetchError) throw fetchError;

    const ownerRow = Array.isArray(chapter.books) ? chapter.books[0] : chapter.books;
    if (!ownerRow || (ownerRow as { owner_id: string }).owner_id !== user.id) {
      return NextResponse.json({ error: "Not authorised." }, { status: 403 });
    }

    const { error: deleteError } = await supabase.from("chapters").delete().eq("id", chapterId);
    if (deleteError) throw deleteError;

    await renumberChapters(supabase, chapter.book_id);

    return NextResponse.json({ content: { deleted: true, chapterId } });
  } catch (error) {
    console.error("Delete chapter failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  try {
    const { chapterId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if ("title" in body) update.title = body.title?.trim() || null;
    if (body.sectionType) update.section_type = body.sectionType;
    if (typeof body.excludeFromRewrite === "boolean") update.exclude_from_rewrite = body.excludeFromRewrite;
    if (typeof body.excludeFromExport === "boolean") update.exclude_from_export = body.excludeFromExport;
    if ("structureNotes" in body) update.structure_notes = body.structureNotes?.trim() || null;
    if (body.clearSummary) {
      update.summary = null;
      update.status = "pending";
    }

    const { data, error } = await supabase.from("chapters").update(update).eq("id", chapterId).select("*").single();
    if (error) throw error;

    let invalidatedCount = 0;
    if (body.invalidateBookEvaluations) {
      const { data: deleted, error: invalidateError } = await supabase
        .from("coherence_reports")
        .delete()
        .eq("book_id", data.book_id)
        .in("report_type", STALE_REPORT_TYPES)
        .select("id");
      if (invalidateError) throw invalidateError;
      invalidatedCount = deleted?.length || 0;
    }

    return NextResponse.json({ content: { chapter: data, invalidatedCount } });
  } catch (error) {
    console.error("Update chapter failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
