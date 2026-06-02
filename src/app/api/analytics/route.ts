/**
 * GET /api/analytics
 *
 * Returns all auto_review_jobs for the authenticated user, enriched with the
 * book title and derived telemetry metrics computed from the structured log.
 *
 * Derived per-run metrics (computed server-side):
 *   durationMs      – total wall-clock time (completed_at − created_at)
 *   stageDurations  – array of { stage, durationMs, iteration } from stage_complete entries
 *   scoreSnapshots  – array of { iteration, scores, baselineScores, avgScore } from critics_check entries
 *   model           – LLM model name extracted from the first 'info' entry with metadata.model
 *   avgScore        – final average critic score (last critics_check entry)
 *
 * Clients (the analytics page) use these to render:
 *   - Per-stage timing bar charts
 *   - Score progression tables across rewrite iterations
 *   - Model comparison across runs
 *   - Book-size vs duration correlation
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Shape of a structured telemetry log entry (written by auto-review-runner.tsx). */
type TelemetryEntry = {
  type: "stage_complete" | "stage_error" | "info";
  stage?: string;
  iteration: number;
  message: string;
  durationMs?: number;
  scores?: Record<string, number | null>;
  baselineScores?: Record<string, number | null>;
  metadata?: Record<string, unknown>;
  ts: string;
};

/** Per-stage timing record extracted from a stage_complete log entry. */
export type StageDuration = {
  stage: string;
  durationMs: number;
  iteration: number;
};

/** Critic score snapshot extracted from a critics_check log entry. */
export type ScoreSnapshot = {
  iteration: number;
  scores: Record<string, number | null>;
  baselineScores?: Record<string, number | null>;
  avgScore: number | null;
};

/** Full analytics record returned to clients. */
export type RunRecord = {
  id: string;
  book_id: string;
  book_title: string;
  mode: string;
  status: string;
  iteration: number;
  created_at: string;
  completed_at: string | null;
  error: string | null;
  book_stats: { chapters: number; paragraphs: number };
  // Derived
  durationMs: number | null;
  model: string | null;
  avgScore: number | null;
  stageDurations: StageDuration[];
  scoreSnapshots: ScoreSnapshot[];
};

/**
 * Parses the raw log jsonb[] from Supabase into typed TelemetryEntry objects,
 * gracefully ignoring any malformed entries from older runs (pre-telemetry).
 */
function parseLog(raw: unknown[]): TelemetryEntry[] {
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    if (!e.type || !e.message) return [];
    return [e as unknown as TelemetryEntry];
  });
}

/** Extracts per-stage durations from stage_complete log entries. */
function extractStageDurations(entries: TelemetryEntry[]): StageDuration[] {
  return entries.flatMap((e) => {
    if (e.type !== "stage_complete" || !e.stage || e.durationMs === undefined) return [];
    return [{ stage: e.stage, durationMs: e.durationMs, iteration: e.iteration }];
  });
}

/** Extracts critic score snapshots from critics_check stage_complete entries. */
function extractScoreSnapshots(entries: TelemetryEntry[]): ScoreSnapshot[] {
  return entries.flatMap((e) => {
    if (!e.stage?.includes("critics_check") || !e.scores) return [];
    const values = Object.values(e.scores).filter((v): v is number => v !== null);
    const avgScore = values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : null;
    return [{
      iteration: e.iteration,
      scores: e.scores,
      baselineScores: e.baselineScores,
      avgScore,
    }];
  });
}

/** Extracts the model name from the first info entry that carries metadata.model. */
function extractModel(entries: TelemetryEntry[]): string | null {
  const entry = entries.find((e) => e.type === "info" && (e.metadata?.model as string | undefined));
  return (entry?.metadata?.model as string | undefined) ?? null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    // Fetch all jobs with book title via foreign key join.
    // Limit 200 so the page stays fast; older runs can be paginated later if needed.
    const { data: jobs, error } = await supabase
      .from("auto_review_jobs")
      .select("id, book_id, mode, status, iteration, created_at, completed_at, error, book_stats, log, config, books(title)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const records: RunRecord[] = (jobs ?? []).map((job) => {
      const rawLog = Array.isArray(job.log) ? job.log : [];
      const entries = parseLog(rawLog as unknown[]);

      const durationMs =
        job.completed_at
          ? new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()
          : null;

      const snapshots = extractScoreSnapshots(entries);
      const lastSnapshot = snapshots[snapshots.length - 1];

      return {
        id: job.id,
        book_id: job.book_id,
        book_title: (job.books as { title?: string } | null)?.title ?? "Unknown Book",
        mode: job.mode,
        status: job.status,
        iteration: job.iteration,
        created_at: job.created_at,
        completed_at: job.completed_at ?? null,
        error: job.error ?? null,
        book_stats: {
          chapters: (job.book_stats as { chapters?: number } | null)?.chapters ?? 0,
          paragraphs: (job.book_stats as { paragraphs?: number } | null)?.paragraphs ?? 0,
        },
        durationMs,
        model: extractModel(entries),
        avgScore: lastSnapshot?.avgScore ?? null,
        stageDurations: extractStageDurations(entries),
        scoreSnapshots: snapshots,
      };
    });

    return NextResponse.json({ runs: records });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load analytics." },
      { status: 500 },
    );
  }
}
