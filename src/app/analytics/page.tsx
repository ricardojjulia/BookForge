/**
 * /analytics — Auto-Review Run Analytics
 *
 * Server component. Fetches all auto_review_jobs for the current user via
 * Supabase, derives summary metrics, and passes fully typed RunRecord[] to
 * the interactive RunsTable client component.
 *
 * Summary cards:
 *   Total Runs      – all jobs regardless of status
 *   Completed       – jobs that reached "completed" status
 *   Avg Duration    – mean wall-clock time across completed runs
 *   Avg Cycles      – mean rewrite loop count (1 = ran once, no loop needed)
 *   Green Rate      – % of completed runs where all critics scored ≥ 70
 *
 * The detailed per-run data (stage timings, score progression, model info)
 * lives in the expandable RunDetailPanel inside RunsTable.
 */

import { Container, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { AppShell } from "@/components/layout/app-shell";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import { RunsTable } from "@/components/analytics/runs-table";
import { FreshnessTelemetryPanel } from "@/components/analytics/freshness-telemetry-panel";
import { createClient } from "@/lib/supabase/server";
import type { RunRecord, StageDuration, ScoreSnapshot } from "@/app/api/analytics/route";
import type { FreshnessEventRow } from "@/lib/freshness/analytics";

// ── Telemetry parsing (duplicated from the API route so the server component
//    can work without an internal HTTP round-trip) ────────────────────────────

type TelemetryEntry = {
  type: "stage_complete" | "stage_error" | "info";
  stage?: string;
  iteration: number;
  message: string;
  durationMs?: number;
  scores?: Record<string, number | null>;
  baselineScores?: Record<string, number | null>;
  metadata?: Record<string, unknown>;
};

function parseLog(raw: unknown[]): TelemetryEntry[] {
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    if (!e.type || !e.message) return [];
    return [e as unknown as TelemetryEntry];
  });
}

function extractStageDurations(entries: TelemetryEntry[]): StageDuration[] {
  return entries.flatMap((e) => {
    if (e.type !== "stage_complete" || !e.stage || e.durationMs === undefined) return [];
    return [{ stage: e.stage, durationMs: e.durationMs, iteration: e.iteration }];
  });
}

function extractScoreSnapshots(entries: TelemetryEntry[]): ScoreSnapshot[] {
  return entries.flatMap((e) => {
    if (!e.stage?.includes("critics_check") || !e.scores) return [];
    const values = Object.values(e.scores).filter((v): v is number => v !== null);
    const avgScore = values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : null;
    return [{ iteration: e.iteration, scores: e.scores, baselineScores: e.baselineScores, avgScore }];
  });
}

function extractModel(entries: TelemetryEntry[]): string | null {
  const entry = entries.find((e) => e.type === "info" && (e.metadata?.model as string | undefined));
  return (entry?.metadata?.model as string | undefined) ?? null;
}

// ── Summary metric helpers ────────────────────────────────────────────────────

function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text size="xl" fw={700} mt={4}>{value}</Text>
      {sub && <Text size="xs" c="dimmed">{sub}</Text>}
    </Paper>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell>
        <Container size="xl">
          <Text c="dimmed">Please sign in to view analytics.</Text>
        </Container>
      </AppShell>
    );
  }

  const { data: jobs } = await supabase
    .from("auto_review_jobs")
    .select("id, book_id, mode, status, iteration, created_at, completed_at, error, book_stats, log, books(title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const freshnessWindow = new Date();
  freshnessWindow.setDate(freshnessWindow.getDate() - 7);
  const freshnessWindowStart = freshnessWindow.toISOString();
  const { data: freshnessRows } = await supabase
    .from("freshness_events")
    .select("event_name,route_key,status,reason,age_ms,error,occurred_at")
    .eq("user_id", user.id)
    .gte("occurred_at", freshnessWindowStart)
    .order("occurred_at", { ascending: false })
    .limit(5000);

  // Build typed RunRecord[] with derived telemetry metrics
  const runs: RunRecord[] = (jobs ?? []).map((job) => {
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

  // ── Summary metrics ─────────────────────────────────────────────────────────

  const completed = runs.filter((r) => r.status === "completed");
  const failed = runs.filter((r) => r.status === "failed");

  const avgDurationMs = avg(completed.map((r) => r.durationMs).filter((d): d is number => d !== null));
  // "Cycles" = iteration + 1 (0 iterations = 1 cycle, 1 iteration = 2 cycles, etc.)
  const avgCycles = avg(completed.map((r) => r.iteration + 1));
  // A run "went green" if its last score snapshot had avgScore ≥ 70
  const greenRuns = completed.filter((r) => (r.avgScore ?? 0) >= 70).length;
  const greenRate = completed.length ? Math.round((greenRuns / completed.length) * 100) : null;

  // Most used mode across all runs
  const modeCounts = runs.reduce<Record<string, number>>((acc, r) => {
    acc[r.mode] = (acc[r.mode] ?? 0) + 1;
    return acc;
  }, {});
  const topMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topModeLabel: Record<string, string> = {
    full_review: "Full Review",
    make_shorter: "Make Shorter",
    make_longer: "Make Longer",
  };

  return (
    <AppShell>
      <Container size="xl">
        <Stack gap="xl">
          <DataFreshnessBanner routeKey="analytics:runs" fetchedAt={new Date().toISOString()} label="Analytics data" />
          <div>
            <Title>Run Analytics</Title>
            <Text c="dimmed">
              Performance and quality telemetry for every Auto-Review Wizard run.
              Click any row to see per-stage timing and score progression.
            </Text>
          </div>

          {/* Summary metric cards */}
          <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }}>
            <MetricCard
              label="Total Runs"
              value={String(runs.length)}
              sub={`${completed.length} completed · ${failed.length} failed`}
            />
            <MetricCard
              label="Avg Duration"
              value={fmtDuration(avgDurationMs)}
              sub="completed runs only"
            />
            <MetricCard
              label="Avg Cycles"
              value={avgCycles !== null ? `${avgCycles}` : "—"}
              sub="rewrite loops per run"
            />
            <MetricCard
              label="Green Rate"
              value={greenRate !== null ? `${greenRate}%` : "—"}
              sub="runs with avg score ≥ 70"
            />
            <MetricCard
              label="Top Mode"
              value={topMode ? (topModeLabel[topMode] ?? topMode) : "—"}
              sub={topMode ? `${modeCounts[topMode]} run(s)` : "no runs yet"}
            />
          </SimpleGrid>

          <FreshnessTelemetryPanel
            rows={(freshnessRows ?? []) as FreshnessEventRow[]}
            fetchedAt={new Date().toISOString()}
          />

          {/* Per-run breakdown */}
          <div>
            <Group justify="space-between" mb="sm">
              <Text fw={600}>All Runs</Text>
              <Text size="xs" c="dimmed" pr="md">
                Status · Duration · Cycles · Avg Score · Paragraphs
              </Text>
            </Group>
            <RunsTable runs={runs} />
          </div>
        </Stack>
      </Container>
    </AppShell>
  );
}
