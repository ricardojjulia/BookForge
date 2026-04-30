import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const REVISING_SOURCE_STATUSES = ["draft", "created", "summarized", "manual"];
const AI_CREATED_STATUSES = new Set(["planned", "generating", "created"]);

export async function markBookRevising(supabase: SupabaseClient, bookId: string) {
  const { error } = await supabase
    .from("books")
    .update({ status: "revising", updated_at: new Date().toISOString() })
    .eq("id", bookId)
    .in("status", REVISING_SOURCE_STATUSES);

  if (error) throw error;
}

export async function markBookExported(supabase: SupabaseClient, bookId: string) {
  const { error } = await supabase
    .from("books")
    .update({ status: "exported", updated_at: new Date().toISOString() })
    .eq("id", bookId)
    .not("status", "in", "(planned,generating)");

  if (error) throw error;
}

export function getBookAuthorDisplay(book: { author_name?: string | null; status?: string | null }) {
  if (book.author_name?.trim()) return book.author_name;
  return AI_CREATED_STATUSES.has(String(book.status || "")) ? "Forged by BookForge" : "Unknown author";
}
