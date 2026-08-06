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

import { Badge, Container, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import { RunsTable } from "@/components/analytics/runs-table";
import { FreshnessTelemetryPanel } from "@/components/analytics/freshness-telemetry-panel";
import { WorkflowCoverageTable } from "@/components/analytics/workflow-coverage-table";
import { ManualRunsTable } from "@/components/analytics/manual-runs-table";
import { EstimationAccuracyTable, StaleIncidentsPanel, type StaleIncidentRow } from "@/components/analytics/job-health-panel";
import { DailyCallStatsTable, ModelCallBreakdownTable, type DailyCallStatsRow, type ModelCallStatsRow } from "@/components/analytics/model-call-stats-panel";
import { createClient } from "@/lib/supabase/server";
import { detectAndHealStaleAutoReviewJobs } from "@/lib/ai/job-state";
import type { RunRecord, StageDuration, ScoreSnapshot } from "@/app/api/analytics/route";

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

type MetadataSelectionSource = "explicit_snapshot" | "branch_active" | "active_snapshot" | "unknown";

type ProvenanceRunRecord = {
  workflow: "auto_review" | "revision";
  label: string;
  source: MetadataSelectionSource;
  hasSnapshot: boolean;
  hasBranch: boolean;
  createdAt: string;
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

function normalizeSelectionSource(value: unknown): MetadataSelectionSource {
  if (value === "explicit_snapshot" || value === "branch_active" || value === "active_snapshot") {
    return value;
  }
  return "unknown";
}

function parseSelectionRecord(
  record: Record<string, unknown> | null | undefined,
  key: "config" | "settings",
): { source: MetadataSelectionSource; hasSnapshot: boolean; hasBranch: boolean } {
  const payload = record && typeof record === "object" ? (record[key] as Record<string, unknown> | null | undefined) : null;
  return {
    source: normalizeSelectionSource(payload?.metadataSelectionSource),
    hasSnapshot: Boolean(payload?.metadataSnapshotId),
    hasBranch: Boolean(payload?.metadataBranchName),
  };
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
      <Container size="xl">
        <Text c="dimmed">Please sign in to view analytics.</Text>
      </Container>
    );
  }

  const { data: jobs } = await supabase
    .from("auto_review_jobs")
    .select("id, book_id, mode, status, current_stage, iteration, created_at, completed_at, error, book_stats, log, config, metadata_snapshot_id, books(title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const healedAutoReviewJobIds = jobs
    ? await detectAndHealStaleAutoReviewJobs(supabase, user.id, jobs)
    : [];
  for (const job of jobs ?? []) {
    if (healedAutoReviewJobIds.includes(job.id)) job.status = "failed";
  }

  const { data: revisionJobs } = await supabase
    .from("revision_jobs")
    .select("id, book_id, mode, status, created_at, completed_at, settings, metadata_snapshot_id, books(title)")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: staleIncidents } = await supabase
    .from("model_call_events")
    .select("id, task, duration_ms, error_signature, created_at")
    .eq("user_id", user.id)
    .eq("event_type", "job_stale_detected")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: completionSummaries } = await supabase
    .from("model_call_events")
    .select("task, outcome, duration_ms, estimated_duration_ms")
    .eq("user_id", user.id)
    .eq("event_type", "job_completed_summary");

  // Raw model_call volume/latency/success trend -- computed in SQL (see
  // model_call_daily_stats/model_call_stats_by_model) rather than pulling
  // thousands of raw rows per day into the page, since a single busy day can
  // already exceed 3,000 calls.
  const { data: dailyCallStatsRaw } = await supabase.rpc("model_call_daily_stats", {
    p_user_id: user.id,
    p_days: 14,
  });
  const { data: callStatsByModelRaw } = await supabase.rpc("model_call_stats_by_model", {
    p_user_id: user.id,
    p_days: 14,
  });
  const dailyCallStats = (dailyCallStatsRaw ?? []) as DailyCallStatsRow[];
  const callStatsByModel = (callStatsByModelRaw ?? []) as ModelCallStatsRow[];

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

  const provenanceRuns: ProvenanceRunRecord[] = [
    ...(jobs ?? []).map((job): ProvenanceRunRecord => {
      const selection = parseSelectionRecord(job as Record<string, unknown>, "config");
      return {
        workflow: "auto_review",
        label: `${job.mode} · ${(job.books as { title?: string } | null)?.title ?? "Unknown Book"}`,
        source: selection.source,
        hasSnapshot: selection.hasSnapshot || Boolean((job as { metadata_snapshot_id?: string | null }).metadata_snapshot_id),
        hasBranch: selection.hasBranch,
        createdAt: job.created_at,
      };
    }),
    ...(revisionJobs ?? []).map((job): ProvenanceRunRecord => {
      const selection = parseSelectionRecord(job as Record<string, unknown>, "settings");
      return {
        workflow: "revision",
        label: `${job.mode} · ${job.status}`,
        source: selection.source,
        hasSnapshot: selection.hasSnapshot || Boolean((job as { metadata_snapshot_id?: string | null }).metadata_snapshot_id),
        hasBranch: selection.hasBranch,
        createdAt: job.created_at,
      };
    }),
  ];

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

  // ── Manual workflow runs (Critic/Blueprint/Execute Rewrite/Drift Check,
  //    clicked individually rather than through the Auto-Review Wizard) ───────
  type ManualRunRecord = {
    id: string;
    book_title: string;
    mode: string;
    status: string;
    durationMs: number | null;
    progress: { attempted?: number; successful?: number; failed?: number; totalUnits?: number } | null;
    createdAt: string;
  };
  const manualRuns: ManualRunRecord[] = (revisionJobs ?? []).map((job) => {
    const settings = job.settings as { progress?: ManualRunRecord["progress"] } | null;
    return {
      id: job.id,
      book_title: (job.books as { title?: string } | null)?.title ?? "Unknown Book",
      mode: job.mode,
      status: job.status ?? "unknown",
      durationMs: job.completed_at ? new Date(job.completed_at).getTime() - new Date(job.created_at).getTime() : null,
      progress: settings?.progress ?? null,
      createdAt: job.created_at,
    };
  });
  const manualCompleted = manualRuns.filter((r) => r.status === "completed");
  const manualFailed = manualRuns.filter((r) => r.status === "failed");
  const manualAvgDurationMs = avg(manualCompleted.map((r) => r.durationMs).filter((d): d is number => d !== null));
  const manualSuccessRate = manualRuns.length
    ? Math.round((manualCompleted.length / manualRuns.length) * 100)
    : null;

  // ── Job health & estimation trust ───────────────────────────────────────────
  type EstimationAccuracyRow = {
    task: string;
    jobCount: number;
    avgActualMs: number;
    avgEstimatedMs: number | null;
  };
  const accuracyByTask = new Map<string, { durations: number[]; estimates: number[] }>();
  for (const row of completionSummaries ?? []) {
    if (row.outcome !== "success" || typeof row.duration_ms !== "number") continue;
    const bucket = accuracyByTask.get(row.task) ?? { durations: [], estimates: [] };
    bucket.durations.push(row.duration_ms);
    if (typeof row.estimated_duration_ms === "number") bucket.estimates.push(row.estimated_duration_ms);
    accuracyByTask.set(row.task, bucket);
  }
  const estimationAccuracy: EstimationAccuracyRow[] = Array.from(accuracyByTask.entries())
    .map(([task, bucket]) => ({
      task,
      jobCount: bucket.durations.length,
      avgActualMs: avg(bucket.durations) ?? 0,
      avgEstimatedMs: bucket.estimates.length ? avg(bucket.estimates) : null,
    }))
    .sort((a, b) => b.jobCount - a.jobCount);

  // ── Model call volume & performance summary ─────────────────────────────────
  const todayCallStats = dailyCallStats[0] ?? null;
  const priorDayStats = dailyCallStats.slice(1, 8);
  const priorAvgCalls = priorDayStats.length
    ? Math.round(priorDayStats.reduce((sum, row) => sum + row.call_count, 0) / priorDayStats.length)
    : null;
  const todayVsAvgPct =
    todayCallStats && priorAvgCalls
      ? Math.round(((todayCallStats.call_count - priorAvgCalls) / priorAvgCalls) * 100)
      : null;
  const todaySuccessRate =
    todayCallStats && todayCallStats.call_count
      ? Math.round((todayCallStats.success_count / todayCallStats.call_count) * 100)
      : null;

  const explicitRuns = provenanceRuns.filter((run) => run.source === "explicit_snapshot").length;
  const branchRuns = provenanceRuns.filter((run) => run.source === "branch_active").length;
  const fallbackRuns = provenanceRuns.filter((run) => run.source === "active_snapshot").length;
  const unknownRuns = provenanceRuns.filter((run) => run.source === "unknown").length;
  const provenanceCoverage = provenanceRuns.length ? Math.round((explicitRuns / provenanceRuns.length) * 100) : null;
  const provenanceQualityLabel =
    provenanceCoverage === null
      ? "n/a"
      : provenanceCoverage >= 80
        ? "healthy"
        : provenanceCoverage >= 50
          ? "watch"
          : "at risk";

  return (
    <Container size="xl">
      <Stack gap="xl">
        <DataFreshnessBanner routeKey="analytics:runs" fetchedAt={new Date().toISOString()} label="Analytics data" />
        <div>
          <Title>Run Analytics</Title>
          <Text c="dimmed">
            Performance and quality telemetry across every workflow — Auto-Review Wizard runs below, manual
            Critic/Blueprint/Rewrite runs and job-health stats further down. Click any Auto-Review row to see
            per-stage timing and score progression.
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

        <FreshnessTelemetryPanel />

        <Paper withBorder radius="md" p="md" bg="#fbfaf8">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={700}>Snapshot Provenance</Text>
                <Text size="sm" c="dimmed">
                  Coverage for snapshot-driven runs across auto-review and revision workflows.
                </Text>
              </div>
              <Badge color={provenanceCoverage === null ? "gray" : provenanceCoverage >= 80 ? "green" : provenanceCoverage >= 50 ? "yellow" : "red"} variant="light">
                {provenanceQualityLabel}
              </Badge>
            </Group>

            <SimpleGrid cols={{ base: 2, sm: 4 }}>
              <MetricCard label="Tracked Runs" value={String(provenanceRuns.length)} sub="auto-review + revision jobs" />
              <MetricCard label="Explicit Snapshot" value={String(explicitRuns)} sub={provenanceCoverage === null ? "no data" : `${provenanceCoverage}% coverage`} />
              <MetricCard label="Branch Resolved" value={String(branchRuns)} sub="resolved from branch-active snapshot" />
              <MetricCard label="Active Fallback" value={String(fallbackRuns)} sub={unknownRuns > 0 ? `${unknownRuns} unknown` : "directly recoverable"} />
            </SimpleGrid>

            <Paper withBorder radius="md" p="sm" bg="white">
              <Group justify="space-between" align="flex-start" mb="xs">
                <div>
                  <Text fw={600}>Coverage by workflow</Text>
                  <Text size="xs" c="dimmed">
                    Explicit snapshot selection is the strongest provenance signal. Branch resolution is still reproducible but less direct.
                  </Text>
                </div>
                <Text size="xs" c="dimmed">
                  {provenanceRuns.length} total
                </Text>
              </Group>
              <WorkflowCoverageTable provenanceRuns={provenanceRuns} />
            </Paper>
          </Stack>
        </Paper>

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

        {/* Manual workflow runs -- Critic/Blueprint/Execute Rewrite/Drift
            Check clicked individually rather than through the Auto-Review
            Wizard. This is the far more common path in practice; the
            summary cards/table above only ever reflect Auto-Review runs. */}
        <div>
          <Title order={2}>Manual Workflow Runs</Title>
          <Text c="dimmed" mb="sm">
            Critic, Blueprint, Execute Rewrite, and Drift Check runs triggered individually rather than through the
            Auto-Review Wizard.
          </Text>
          <SimpleGrid cols={{ base: 2, sm: 4 }} mb="sm">
            <MetricCard label="Total Runs" value={String(manualRuns.length)} sub={`${manualCompleted.length} completed · ${manualFailed.length} failed`} />
            <MetricCard label="Avg Duration" value={fmtDuration(manualAvgDurationMs)} sub="completed runs only" />
            <MetricCard label="Success Rate" value={manualSuccessRate !== null ? `${manualSuccessRate}%` : "—"} sub="of all manual runs" />
            <MetricCard label="Stale Incidents" value={String(staleIncidents?.length ?? 0)} sub="auto-detected & healed" />
          </SimpleGrid>
          <ManualRunsTable runs={manualRuns} />
        </div>

        {/* Job health & estimation trust -- surfaces the auto-heal sweep's
            findings and how accurate the AI Task Preflight modal's time
            estimates actually are, compared against real outcomes. */}
        <div>
          <Title order={2}>Job Health &amp; Estimation Trust</Title>
          <Text c="dimmed" mb="sm">
            Stalled-job detection and estimated-vs-actual duration, computed from real job outcomes rather than the static
            formula shown before a run starts.
          </Text>
          <Stack gap="md">
            <StaleIncidentsPanel incidents={(staleIncidents ?? []) as StaleIncidentRow[]} />
            <EstimationAccuracyTable rows={estimationAccuracy} />
          </Stack>
        </div>

        {/* Model call volume & performance -- every actual LLM call
            (any provider), not just Auto-Review or manual workflow runs.
            Answers "are we just testing hard today, or is something
            actually degrading?" directly from real telemetry instead of
            guesswork. */}
        <div>
          <Title order={2}>Model Call Volume &amp; Performance</Title>
          <Text c="dimmed" mb="sm">
            Every model call across every provider and workflow, last 14 days. Use this to tell heavy usage apart
            from real latency or reliability regressions.
          </Text>
          <SimpleGrid cols={{ base: 2, sm: 4 }} mb="sm">
            <MetricCard label="Calls Today" value={todayCallStats ? String(todayCallStats.call_count) : "—"} sub="model_call events" />
            <MetricCard
              label="vs 7-Day Avg"
              value={todayVsAvgPct !== null ? `${todayVsAvgPct > 0 ? "+" : ""}${todayVsAvgPct}%` : "—"}
              sub={priorAvgCalls !== null ? `avg ${priorAvgCalls}/day` : "not enough history"}
            />
            <MetricCard
              label="Success Rate Today"
              value={todaySuccessRate !== null ? `${todaySuccessRate}%` : "—"}
              sub="of today's calls"
            />
            <MetricCard
              label="p95 Latency Today"
              value={todayCallStats?.p95_duration_ms ? `${(todayCallStats.p95_duration_ms / 1000).toFixed(1)}s` : "—"}
              sub="slowest 5% of calls"
            />
          </SimpleGrid>
          <Paper withBorder radius="md" p="sm" bg="white" mb="sm">
            <Text fw={600} size="sm" mb="xs">Daily trend</Text>
            <DailyCallStatsTable rows={dailyCallStats} />
          </Paper>
          <Paper withBorder radius="md" p="sm" bg="white">
            <Text fw={600} size="sm" mb="xs">By model</Text>
            <ModelCallBreakdownTable rows={callStatsByModel} />
          </Paper>
        </div>
      </Stack>
    </Container>
  );
}
