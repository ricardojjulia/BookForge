export const UNDRAFTED_MANUSCRIPT_ERROR =
  'This book has no drafted manuscript prose yet. Critic and Auto-Review evaluate chapter text, not outline summaries. Run "Write Your Chapters" first, then try again.';

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export async function bookHasDraftedParagraphs(supabase: SupabaseClient, bookId: string): Promise<boolean> {
  const { count } = await supabase
    .from("paragraphs")
    .select("id", { count: "exact", head: true })
    .eq("book_id", bookId);
  return (count ?? 0) > 0;
}
