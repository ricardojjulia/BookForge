import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildResumeBody,
  checkAndRecordResumeAttempt,
  chunkedJobPath,
  isStaleChunkedJob,
  type ChunkedJobRow,
} from "@/lib/ai/resume-stale-chunked-jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST as generateDraftPOST } from "@/app/api/books/[bookId]/generate-draft/route";
import { POST as rewriteExecutePOST } from "@/app/api/books/[bookId]/rewrite-execute/route";

// Platform-wide backstop, on top of the per-book one in
// resume-stale-chunked-jobs.ts: that one only fires when someone actually
// has a page open for the affected book. This runs on a fixed schedule
// (see vercel.json) regardless of whether anyone is looking at the app at
// all -- "we can't expect a resume to happen by chance" was the exact gap
// this closes. Bounded by the slower of the two routes' own maxDuration
// budgets since it awaits each resume directly rather than firing more
// fire-and-forget work.
export const maxDuration = 800;

function isAuthorized(authorization: string | null, cronSecret: string) {
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(authorization || "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Resume dispatcher is not configured." }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (!isAuthorized(authHeader, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: jobs, error } = await supabase
    .from("revision_jobs")
    .select("id,book_id,mode,status,settings,created_by")
    .eq("status", "running")
    .in("mode", ["full_book_rewrite", "creation_draft_generation"]);

  if (error) {
    console.error("resume-stale-chunked-jobs: failed to list jobs", error);
    return NextResponse.json({ error: "Failed to list jobs." }, { status: 500 });
  }

  const staleJobs = ((jobs || []) as ChunkedJobRow[]).filter((job) => isStaleChunkedJob(job) && job.created_by);
  const results: Array<{ jobId: string; bookId: string; mode: string; resumed: boolean; error?: string }> = [];

  for (const job of staleJobs) {
    try {
      if ((await checkAndRecordResumeAttempt(supabase, job)) === "ceiling_reached") {
        results.push({ jobId: job.id, bookId: job.book_id, mode: job.mode, resumed: false, error: "resume ceiling reached -- marked failed" });
        continue;
      }
      const body = { ...buildResumeBody(job), actingUserId: job.created_by };
      const syntheticRequest = new Request(new URL(chunkedJobPath(job.mode, job.book_id), request.url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: authHeader || "" },
        body: JSON.stringify(body),
      });
      const handler = job.mode === "full_book_rewrite" ? rewriteExecutePOST : generateDraftPOST;
      const response = await handler(syntheticRequest, { params: Promise.resolve({ bookId: job.book_id }) });
      results.push({ jobId: job.id, bookId: job.book_id, mode: job.mode, resumed: response.ok });
    } catch (err) {
      results.push({
        jobId: job.id,
        bookId: job.book_id,
        mode: job.mode,
        resumed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    checked: (jobs || []).length,
    stale: staleJobs.length,
    resumed: results.filter((r) => r.resumed).length,
    results,
  });
}
