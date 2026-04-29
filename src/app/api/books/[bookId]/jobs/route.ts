import { NextResponse } from "next/server";
import { extractJobProgress, isStaleRunningJob } from "@/lib/ai/job-state";
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

    return NextResponse.json({
      content: {
        jobs: ((data || []) as RevisionJobRow[]).map((job) => {
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
    console.error("Job list failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load jobs." }, { status: 500 });
  }
}
