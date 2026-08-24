import { after } from "next/server";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Found live: a real chunk's normal cadence is 20-40s between heartbeats, so
// 90s should have been generous margin -- but a Studio page load landed at
// exactly 85s stale, 5 seconds short of that threshold, and skipped the
// resume. Lowered so a near-miss like that doesn't cost a full extra
// page-load cycle (this session's periodic refresh is 60s) before the next
// chance to catch it.
const STALE_AFTER_MS = 45_000;

type ChunkedJobRow = {
  id: string;
  book_id: string;
  mode: string;
  status: string;
  settings: Record<string, unknown> | null;
};

function lastHeartbeatMs(settings: Record<string, unknown> | null): number | null {
  const progress = settings?.progress as { lastHeartbeatAt?: string } | undefined;
  if (!progress?.lastHeartbeatAt) return null;
  const parsed = Date.parse(progress.lastHeartbeatAt);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * rewrite-execute and generate-draft each process one bounded chunk per
 * request and rely on a self-chained continuation (see after() in both
 * routes) to keep going -- proven live to work most of the time but not
 * reliably: a real production run self-chained cleanly 4 times in a row,
 * then the 5th continuation silently never fired (no error, no timeout log,
 * nothing queryable anywhere) and the job just sat "running" with a frozen
 * heartbeat until the unrelated 10-minute stale sweep force-failed it.
 *
 * This is the backstop: instead of waiting for that sweep to give up and
 * mark the job dead, opportunistically re-dispatch any chunked job whose
 * heartbeat has gone stale for even a short window (90s -- comfortably past
 * one real chunk's normal cadence, well before the 600s failure threshold)
 * using the CURRENT authenticated request's own cookie. Runs wherever a
 * user loads a page for this book, so a stuck job self-heals the next time
 * they check in, instead of requiring them to find the exact stuck page and
 * click a button again.
 */
export async function resumeStaleChunkedJobs(
  supabase: SupabaseClient,
  bookId: string,
  cookie: string,
  baseUrl: URL,
): Promise<string[]> {
  const { data: jobs } = await supabase
    .from("revision_jobs")
    .select("id,book_id,mode,status,settings")
    .eq("book_id", bookId)
    .eq("status", "running")
    .in("mode", ["full_book_rewrite", "creation_draft_generation"]);

  const resumed: string[] = [];
  for (const job of (jobs || []) as ChunkedJobRow[]) {
    const heartbeatMs = lastHeartbeatMs(job.settings);
    if (heartbeatMs === null || Date.now() - heartbeatMs < STALE_AFTER_MS) continue;

    const path =
      job.mode === "full_book_rewrite" ? `/api/books/${bookId}/rewrite-execute` : `/api/books/${bookId}/generate-draft`;
    const settings = job.settings || {};
    const body =
      job.mode === "full_book_rewrite"
        ? {
            jobId: job.id,
            maxUnits: settings.maxUnits,
            campaignId: settings.campaignId ?? undefined,
            rewriteExistingDrafts: settings.rewriteExistingDrafts,
            rewriteAccepted: settings.rewriteAccepted,
            distributeAcrossChapters: settings.distributeAcrossChapters,
            coverageMode: settings.coverageMode,
            strategyId: settings.strategyId,
            strategySettings: settings.strategySettings,
            authorInstructions: settings.authorInstructions ?? undefined,
          }
        : { jobId: job.id };

    // after() rather than a bare void fetch() -- proven live this session
    // that the bare pattern is NOT safe (Vercel can freeze a function's
    // execution right after its response is sent). after() isn't provably
    // 100% reliable either (the self-chain it's meant to back up already
    // demonstrated a silent failure after 4 clean successes), which is
    // exactly why this exists as an independent, repeated backstop rather
    // than a single point of trust: every page load for this book gets its
    // own attempt, so one unreliable mechanism failing once doesn't leave
    // the job stuck forever.
    const requestBody = JSON.stringify(body);
    const target = new URL(path, baseUrl).toString();
    after(() =>
      fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: requestBody,
      }).catch(() => {}),
    );
    resumed.push(job.id);
  }
  return resumed;
}
