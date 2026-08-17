import { NextResponse } from "next/server";
import { detectAndHealStaleJobs, extractJobProgress, isStaleRunningJob } from "@/lib/ai/job-state";
import { createClient } from "@/lib/supabase/server";

type RevisionJobRow = {
  id: string;
  book_id: string;
  mode: string;
  status: string | null;
  settings: unknown;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

const ACTIVE_STATUSES = new Set(["queued", "running", "paused"]);

// Cross-book counterpart to /api/books/[bookId]/jobs -- that route only
// ever answers "what's running on THIS book," which is why a job started on
// one book becomes invisible the moment the user navigates to another book,
// the dashboard, or settings. This one scans every revision_jobs row this
// user has ever triggered (created_by, not book ownership -- a job is only
// ever created by the person who clicked the button that queued it) so a
// single persistent indicator in the app shell can show it regardless of
// which page is open.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data, error } = await supabase
      .from("revision_jobs")
      .select("id,book_id,mode,status,settings,error_message,created_at,started_at,completed_at")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;

    const jobs = (data || []) as RevisionJobRow[];
    const healedJobIds = await detectAndHealStaleJobs(supabase, user.id, jobs);
    for (const job of jobs) {
      if (healedJobIds.includes(job.id)) job.status = "failed";
    }

    const bookIds = Array.from(new Set(jobs.map((job) => job.book_id).filter(Boolean)));
    const { data: books } = bookIds.length
      ? await supabase.from("books").select("id,title").in("id", bookIds)
      : { data: [] as Array<{ id: string; title: string | null }> };
    const titleByBookId = new Map((books || []).map((book) => [book.id, book.title || "Untitled book"]));

    const enriched = jobs.map((job) => {
      const progress = extractJobProgress(job.settings);
      return {
        ...job,
        bookTitle: titleByBookId.get(job.book_id) || "Untitled book",
        progress,
        isStale: isStaleRunningJob(job.status, progress),
      };
    });

    return NextResponse.json({
      content: {
        activeJobs: enriched.filter((job) => ACTIVE_STATUSES.has(job.status || "")),
        recentJobs: enriched,
      },
    });
  } catch (error) {
    console.error("Global active jobs lookup failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load active jobs." }, { status: 500 });
  }
}
