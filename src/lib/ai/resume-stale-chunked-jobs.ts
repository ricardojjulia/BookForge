import { after } from "next/server";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Found live: a real chunk's normal cadence is 20-40s between heartbeats, so
// 90s should have been generous margin -- but a real Studio page load landed
// at exactly 85s stale and skipped the resume by 5 seconds, costing a full
// extra page-load cycle before the next chance to catch it. Lowered to give
// real margin against this class of near-miss.
export const STALE_AFTER_MS = 45_000;

export type ChunkedJobRow = {
  id: string;
  book_id: string;
  mode: string;
  status: string;
  settings: Record<string, unknown> | null;
  created_by?: string | null;
};

export function chunkedJobPath(mode: string, bookId: string): string {
  return mode === "full_book_rewrite" ? `/api/books/${bookId}/rewrite-execute` : `/api/books/${bookId}/generate-draft`;
}

export function lastHeartbeatMs(settings: Record<string, unknown> | null): number | null {
  const progress = settings?.progress as { lastHeartbeatAt?: string } | undefined;
  if (!progress?.lastHeartbeatAt) return null;
  const parsed = Date.parse(progress.lastHeartbeatAt);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isStaleChunkedJob(job: Pick<ChunkedJobRow, "settings">, now = Date.now()): boolean {
  const heartbeatMs = lastHeartbeatMs(job.settings);
  return heartbeatMs !== null && now - heartbeatMs >= STALE_AFTER_MS;
}

/**
 * Reconstructs the original run-call body for a chunked job from its own
 * persisted settings -- both routes already store everything a resume needs
 * (rewrite-execute: strategyId/strategySettings/maxUnits/etc; generate-draft
 * just needs its jobId). Shared by both callers of this module (the
 * per-book Studio-page backstop and the platform-wide cron) so the two
 * never drift on what a "resume" actually sends.
 */
export function buildResumeBody(job: Pick<ChunkedJobRow, "id" | "mode" | "settings">): Record<string, unknown> {
  const settings = job.settings || {};
  if (job.mode === "full_book_rewrite") {
    return {
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
    };
  }
  return { jobId: job.id };
}

/**
 * rewrite-execute and generate-draft each process one bounded chunk per
 * request and rely on a self-chained continuation (see after() in both
 * routes) to keep going -- proven live to work most of the time but not
 * reliably: a real production run self-chained cleanly 8 times in a row,
 * then a continuation silently never fired (no error, no timeout log,
 * nothing queryable anywhere) and the job just sat "running" with a frozen
 * heartbeat until the unrelated 10-minute stale sweep force-failed it.
 *
 * This is the per-book backstop: opportunistically re-dispatch any chunked
 * job whose heartbeat has gone stale using the CURRENT authenticated page
 * request's own cookie. Runs wherever a user loads a page for this book.
 * See src/app/api/internal/resume-stale-chunked-jobs/route.ts for the
 * platform-wide cron backstop that catches this even when nobody's looking
 * at the app at all.
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
    if (!isStaleChunkedJob(job)) continue;

    const target = new URL(chunkedJobPath(job.mode, bookId), baseUrl).toString();
    const requestBody = JSON.stringify(buildResumeBody(job));
    // after() rather than a bare void fetch() -- proven live this session
    // that the bare pattern is NOT safe (Vercel can freeze a function's
    // execution right after its response is sent). after() isn't provably
    // 100% reliable either, which is exactly why this exists as an
    // independent, repeated backstop (and why the cron backstop exists on
    // top of THIS one) rather than a single point of trust.
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
