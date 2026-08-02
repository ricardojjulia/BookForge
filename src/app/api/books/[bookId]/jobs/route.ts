import { NextResponse } from "next/server";
import { detectAndHealStaleJobs, extractJobProgress, isStaleRunningJob, logJobCompletionSummaries } from "@/lib/ai/job-state";
import { createClient } from "@/lib/supabase/server";

type RevisionJobRow = {
  id: string;
  mode: string;
  status: string | null;
  settings: unknown;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

function isTransientJsonParseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /Unexpected end of JSON input/i.test(message);
}

export async function GET(_: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data, error } = await supabase
      .from("revision_jobs")
      .select("id,mode,status,settings,error_message,created_at,started_at,completed_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw error;

    const jobs = (data || []) as RevisionJobRow[];
    const healedJobIds = await detectAndHealStaleJobs(supabase, user.id, jobs);
    for (const job of jobs) {
      if (healedJobIds.includes(job.id)) {
        job.status = "failed";
      }
    }
    void logJobCompletionSummaries(supabase, user.id, jobs).catch((summaryError) => {
      console.warn("Job completion summary logging failed", summaryError);
    });

    return NextResponse.json({
      content: {
        jobs: jobs.map((job) => {
          const progress = extractJobProgress(job.settings);
          return {
            ...job,
            progress,
            isStale: isStaleRunningJob(job.status, progress),
          };
        }),
      },
    });
  } catch (error) {
    if (isTransientJsonParseError(error)) {
      console.warn("Job list transient parse error", error);
      return NextResponse.json({
        content: {
          jobs: [],
          transient: true,
        },
      });
    }
    console.error("Job list failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load jobs." }, { status: 500 });
  }
}
