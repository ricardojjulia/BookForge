import { computeCriticProgress, type CriticProgress } from "@/lib/critic/progress";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type BookCore = {
  id: string;
  title: string;
  status: string | null;
  author_name: string | null;
  owner_id: string;
};

export async function getBookCore(supabase: SupabaseClient, bookId: string) {
  return supabase.from("books").select("id,title,status,author_name,owner_id").eq("id", bookId).single<BookCore>();
}

export type CoherenceReportRow = {
  id: string;
  report_type: string;
  created_at: string;
  content: Record<string, unknown> | null;
};

export type CriticReportsScope = "all" | "baseline" | "baseline_and_post_and_guidance";

/**
 * Centralizes the coherence_reports query-building for the different scopes
 * each book route needs (the hub wants everything, rewrite-plan only needs
 * baseline coverage, final-manuscript needs baseline+post+guidance) so the
 * filter logic lives in one place instead of being hand-rolled per page.
 */
export async function getBookCriticReports(
  supabase: SupabaseClient,
  bookId: string,
  options: { scope?: CriticReportsScope; limit?: number } = {},
): Promise<{ reports: CoherenceReportRow[]; progress: CriticProgress }> {
  const { scope = "all", limit = 80 } = options;
  let query = supabase
    .from("coherence_reports")
    .select("id,report_type,created_at,content")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (scope === "baseline") {
    query = query.like("report_type", "critic:%");
  } else if (scope === "baseline_and_post_and_guidance") {
    query = query.or("report_type.like.critic:%,report_type.like.critic_post:%,report_type.eq.humanized_guidance");
  }

  const { data } = await query;
  const reports = (data || []) as CoherenceReportRow[];
  return { reports, progress: computeCriticProgress(reports) };
}
