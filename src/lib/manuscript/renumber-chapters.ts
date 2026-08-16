import type { SupabaseClient } from "@supabase/supabase-js";

// Only matches a bare "Chapter 7" style title -- exactly what the importer
// stores when no real title is detected (see parser.ts's `Chapter ${index +
// 1}` fallback). A creative title that merely starts with "Chapter" (e.g.
// "Chapter Eleven: The Reckoning") never matches this, so it's never
// touched -- only synthetic placeholder titles get kept in sync.
const GENERIC_CHAPTER_TITLE = /^chapter\s+\d+$/i;

// After a chapter is deleted or merged away, every remaining chapter must be
// renumbered with no gaps -- chapters has a unique(book_id, chapter_number)
// constraint, and downstream consumers (Rewrite Architect plan directives,
// the Studio chapter list, etc.) assume a dense 1..N sequence. Processing in
// ascending chapter_number order and only ever assigning a number <= the
// current one means each UPDATE always targets a slot the loop has already
// vacated, so this never collides with the unique constraint even though
// it's not run inside one transaction.
export async function renumberChapters(supabase: SupabaseClient, bookId: string) {
  const { data: remaining, error } = await supabase
    .from("chapters")
    .select("id,chapter_number,title")
    .eq("book_id", bookId)
    .order("chapter_number");
  if (error) throw error;

  const now = new Date().toISOString();
  for (const [index, item] of ((remaining || []) as Array<{ id: string; chapter_number: number; title: string | null }>).entries()) {
    const newNumber = index + 1;
    const update: Record<string, unknown> = {};
    if (item.chapter_number !== newNumber) update.chapter_number = newNumber;
    if (item.title && GENERIC_CHAPTER_TITLE.test(item.title.trim())) {
      const genericTitle = `Chapter ${newNumber}`;
      if (item.title.trim() !== genericTitle) update.title = genericTitle;
    }
    if (!Object.keys(update).length) continue;
    update.updated_at = now;
    const { error: updateError } = await supabase.from("chapters").update(update).eq("id", item.id);
    if (updateError) throw updateError;
  }
}
