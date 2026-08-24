/**
 * /analytics — the user-facing view: cost, which models actually worked,
 * time spent per book, and quality results. Rebuilt from what used to be
 * here (pure engineering telemetry -- snapshot provenance, estimation
 * accuracy, raw model-call latency), which now lives at
 * /settings/geek-analytics for anyone who wants that level of detail.
 *
 * Every number here is derived from real data: model_call_events for cost
 * and per-model performance (cost_usd_micros is computed and recorded on
 * every cloud call regardless of deployment mode, so this works the same
 * for managed-SaaS and self-hosted users), revision_jobs/auto_review_jobs
 * for wall-clock AI processing time per book, and coherence_reports
 * (BookForge Critic) for the baseline-vs-latest quality trend per book.
 */

import { Badge, Container, Group, Paper, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import { CostByModelChart, CostTrendChart, ModelSuccessChart, ResultsChart, TimeOnBookChart } from "@/components/analytics/overview-charts";
import { extractCriticScore } from "@/lib/critic/score";
import { isManagedSaasDeployment } from "@/lib/deployment/mode";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DONUT_COLORS = ["grape.6", "indigo.6", "teal.6", "orange.6", "pink.6", "cyan.6", "yellow.6", "red.6"];

function usd(micros: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(micros / 1_000_000);
}

function friendlyModelName(model: string | null): string {
  if (!model) return "Unknown model";
  const afterSlash = model.includes("/") ? model.split("/")[1] : model;
  return afterSlash
    .split("-")
    .map((part) => (part.length <= 3 && /^v?\d/i.test(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(5, 10); // MM-DD
}

function humanizeMode(mode: string): string {
  return mode
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Container size="xl">
        <Text c="dimmed">Please sign in to view analytics.</Text>
      </Container>
    );
  }

  const managedSaas = isManagedSaasDeployment();

  const [{ data: books }, { data: callEvents }, { data: revisionJobs }, { data: autoReviewJobs }, { data: reports }, subscriptionResult] =
    await Promise.all([
      supabase.from("books").select("id,title,created_at").order("created_at", { ascending: false }),
      supabase
        .from("model_call_events")
        .select("model,task,outcome,cost_usd_micros,duration_ms,job_id,created_at")
        .eq("user_id", user.id)
        .eq("event_type", "model_call")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("revision_jobs")
        .select("id,book_id,mode,status,created_at,completed_at")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("auto_review_jobs")
        .select("id,book_id,mode,status,created_at,completed_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("coherence_reports")
        .select("book_id,report_type,content,created_at")
        .like("report_type", "critic%")
        .order("created_at", { ascending: true })
        .limit(2000),
      managedSaas
        ? supabase
            .from("user_subscriptions")
            .select("tier_id,status,trial_ends_at,subscription_tiers(monthly_credit_cap_usd_micros)")
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const bookById = new Map((books || []).map((book) => [book.id, book]));
  const bookTitle = (bookId: string | null) => (bookId ? bookById.get(bookId)?.title || "Unknown book" : "Unattributed");

  // job_id on a model_call_events row can point at either revision_jobs or
  // auto_review_jobs -- build one combined lookup so cost/time can be
  // attributed to a book regardless of which workflow made the call.
  const jobToBook = new Map<string, string>();
  for (const job of revisionJobs || []) if (job.book_id) jobToBook.set(job.id, job.book_id);
  for (const job of autoReviewJobs || []) if (job.book_id) jobToBook.set(job.id, job.book_id);

  // ── Cost ─────────────────────────────────────────────────────────────────
  // "local-model" is a known mislabel, not a real model choice: a separate,
  // generic telemetry path (lib/lmstudio/client.ts's classifyLmStudioError
  // catch-all) defaults to that literal string when it can't thread the
  // real cloud model name through. Verified live: this account is managed
  // SaaS, where LM Studio is unreachable entirely (see docs/SELF_HOSTING.md),
  // so every one of these rows is really a mislabeled cloud call, not local
  // usage -- showing it as "Local Model, 0% success" would be actively
  // misleading on a page whose whole point is trustworthy numbers.
  const events = (callEvents || []).filter((e) => e.model !== "local-model");
  const totalCostMicros = events.reduce((sum, e) => sum + (e.cost_usd_micros || 0), 0);
  const totalCalls = events.length;

  const costByDayMap = new Map<string, number>();
  for (const e of events) {
    const key = dayKey(e.created_at);
    costByDayMap.set(key, (costByDayMap.get(key) || 0) + (e.cost_usd_micros || 0) / 1_000_000);
  }
  const costTrend = Array.from(costByDayMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-30)
    .map(([date, cost]) => ({ date, cost: Math.round(cost * 10000) / 10000 }));

  const costByModelMap = new Map<string, number>();
  for (const e of events) {
    const label = friendlyModelName(e.model);
    costByModelMap.set(label, (costByModelMap.get(label) || 0) + (e.cost_usd_micros || 0) / 1_000_000);
  }
  const costByModel = Array.from(costByModelMap.entries())
    .filter(([, cost]) => cost > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([model, cost], index) => ({ model, cost: Math.round(cost * 10000) / 10000, color: DONUT_COLORS[index % DONUT_COLORS.length] }));

  const costByBookMap = new Map<string, number>();
  for (const e of events) {
    const bId = e.job_id ? jobToBook.get(e.job_id) : undefined;
    const label = bId ? bookTitle(bId) : "Other / not tied to a book";
    costByBookMap.set(label, (costByBookMap.get(label) || 0) + (e.cost_usd_micros || 0));
  }

  // ── Model performance ────────────────────────────────────────────────────
  const perfByModel = new Map<string, { total: number; success: number }>();
  for (const e of events) {
    const label = friendlyModelName(e.model);
    const bucket = perfByModel.get(label) || { total: 0, success: 0 };
    bucket.total += 1;
    if (e.outcome === "success") bucket.success += 1;
    perfByModel.set(label, bucket);
  }
  const modelSuccess = Array.from(perfByModel.entries())
    .filter(([, b]) => b.total >= 2)
    .map(([model, b]) => ({ model, "success rate": Math.round((b.success / b.total) * 100), calls: b.total }))
    .sort((a, b) => b["success rate"] - a["success rate"] || b.calls - a.calls)
    .slice(0, 8);

  // ── Time on book ─────────────────────────────────────────────────────────
  const allJobs = [...(revisionJobs || []), ...(autoReviewJobs || [])];
  const hoursByBookMap = new Map<string, number>();
  for (const job of allJobs) {
    if (!job.book_id || !job.completed_at) continue;
    const hours = (new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 3_600_000;
    if (hours <= 0) continue;
    hoursByBookMap.set(job.book_id, (hoursByBookMap.get(job.book_id) || 0) + hours);
  }
  const timeOnBook = Array.from(hoursByBookMap.entries())
    .map(([bookId, hours]) => ({ book: bookTitle(bookId), hours: Math.round(hours * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 10);

  // ── Results (quality) ────────────────────────────────────────────────────
  // Per book, per stage (baseline/post-rewrite), per lens: keep only the
  // latest score. Reports are fetched oldest-first, so a later write for
  // the same (book, stage, lens) simply overwrites the earlier one --
  // a book Critic'd twice shows its current state, not a double-counted
  // average.
  const baselineLensScores = new Map<string, Map<string, number>>(); // bookId -> lens -> score
  const latestLensScores = new Map<string, Map<string, number>>();
  for (const report of reports || []) {
    if (!report.book_id) continue;
    const score = extractCriticScore(report.content as Record<string, unknown> | null);
    if (score === null) continue;
    const isPost = report.report_type.startsWith("critic_post:");
    const lens = report.report_type.replace("critic_post:", "").replace("critic:", "");
    const target = isPost ? latestLensScores : baselineLensScores;
    const lensTracker = target.get(report.book_id) || new Map<string, number>();
    lensTracker.set(lens, score);
    target.set(report.book_id, lensTracker);
  }
  function averageLensScore(target: Map<string, Map<string, number>>, bookId: string): number | null {
    const lensTracker = target.get(bookId);
    if (!lensTracker || !lensTracker.size) return null;
    const values = Array.from(lensTracker.values());
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }
  const bookIdsWithReports = new Set((reports || []).map((r) => r.book_id).filter(Boolean) as string[]);
  const results = Array.from(bookIdsWithReports)
    .map((bookId) => ({
      book: bookTitle(bookId),
      baseline: averageLensScore(baselineLensScores, bookId),
      latest: averageLensScore(latestLensScores, bookId),
    }))
    .filter((row) => row.baseline !== null || row.latest !== null);

  // ── Recent activity ──────────────────────────────────────────────────────
  const recentActivity = allJobs
    .filter((job) => job.completed_at)
    .sort((a, b) => new Date(b.completed_at as string).getTime() - new Date(a.completed_at as string).getTime())
    .slice(0, 8)
    .map((job) => ({
      id: job.id,
      label: `${humanizeMode(job.mode)} · ${bookTitle(job.book_id)}`,
      status: job.status,
      when: timeAgo(job.completed_at as string),
    }));

  // ── Trial context (managed SaaS only) ────────────────────────────────────
  const subscription = subscriptionResult.data as {
    tier_id: string;
    status: string;
    trial_ends_at: string | null;
    subscription_tiers: { monthly_credit_cap_usd_micros: number } | { monthly_credit_cap_usd_micros: number }[] | null;
  } | null;
  const tierCapMicros = Array.isArray(subscription?.subscription_tiers)
    ? subscription?.subscription_tiers[0]?.monthly_credit_cap_usd_micros
    : subscription?.subscription_tiers?.monthly_credit_cap_usd_micros;
  // Server component, route is force-dynamic -- computed fresh per request, not during a render pass.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const trialDaysLeft =
    subscription?.status === "trialing" && subscription.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - nowMs) / 86_400_000))
      : null;

  return (
    <Container size="xl">
      <Stack gap="xl">
        <DataFreshnessBanner routeKey="analytics:overview" fetchedAt={new Date().toISOString()} label="Analytics data" variant="subtle" />
        <div>
          <Title>Analytics</Title>
          <Text c="dimmed">
            Where your AI spend went, which models actually delivered, how much time each book has taken, and what it
            got you.{" "}
            <Link href="/settings/geek-analytics" style={{ textDecoration: "underline" }}>
              Prefer raw telemetry? See Geek Analytics.
            </Link>
          </Text>
        </div>

        {/* Hero stats */}
        <SimpleGrid cols={{ base: 2, sm: managedSaas ? 4 : 3 }}>
          <MetricCard label="Total spent" value={usd(totalCostMicros)} sub="all-time" tone="grape" />
          <MetricCard label="AI calls made" value={String(totalCalls)} sub="across every workflow" tone="indigo" />
          <MetricCard
            label="Books in progress"
            value={String(books?.length || 0)}
            sub={timeOnBook.length ? `${timeOnBook.length} with AI work logged` : "no AI work yet"}
            tone="teal"
          />
          {managedSaas && tierCapMicros ? (
            <MetricCard
              label="Trial used"
              value={`${Math.min(100, Math.round((totalCostMicros / tierCapMicros) * 100))}%`}
              sub={trialDaysLeft !== null ? `${trialDaysLeft} day(s) left` : "of your plan's cap"}
              tone="orange"
            />
          ) : null}
        </SimpleGrid>

        {managedSaas && tierCapMicros ? (
          <Paper withBorder radius="md" p="md">
            <Group justify="space-between" mb={6}>
              <Text size="sm" fw={600}>Trial allowance</Text>
              <Text size="sm" c="dimmed">
                {usd(totalCostMicros)} of {usd(tierCapMicros)}
              </Text>
            </Group>
            <Progress value={Math.min(100, (totalCostMicros / tierCapMicros) * 100)} color="grape" radius="xl" size="lg" />
          </Paper>
        ) : null}

        {/* Cost */}
        <Paper withBorder radius="md" p="md">
          <Text fw={700} mb={4}>Cost over time</Text>
          <Text size="sm" c="dimmed" mb="sm">Daily AI spend, last 30 days.</Text>
          <CostTrendChart data={costTrend} />
        </Paper>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Paper withBorder radius="md" p="md">
            <Text fw={700} mb={4}>Where the money went</Text>
            <Text size="sm" c="dimmed" mb="sm">Spend by model.</Text>
            <CostByModelChart data={costByModel} />
          </Paper>
          <Paper withBorder radius="md" p="md">
            <Text fw={700} mb={4}>Models that worked</Text>
            <Text size="sm" c="dimmed" mb="sm">Success rate by model (2+ calls).</Text>
            <ModelSuccessChart data={modelSuccess} />
          </Paper>
        </SimpleGrid>

        {/* Time on book */}
        <Paper withBorder radius="md" p="md">
          <Text fw={700} mb={4}>Time on book</Text>
          <Text size="sm" c="dimmed" mb="sm">AI processing hours per book (wall-clock, completed jobs only).</Text>
          <TimeOnBookChart data={timeOnBook} />
        </Paper>

        {/* Results */}
        <Paper withBorder radius="md" p="md">
          <Text fw={700} mb={4}>Results</Text>
          <Text size="sm" c="dimmed" mb="sm">
            Average BookForge Critic score per book -- baseline vs. latest post-rewrite evaluation.
          </Text>
          <ResultsChart data={results} />
        </Paper>

        {/* Recent activity */}
        <Paper withBorder radius="md" p="md">
          <Text fw={700} mb="sm">Recent activity</Text>
          {recentActivity.length ? (
            <Stack gap="xs">
              {recentActivity.map((item) => (
                <Group key={item.id} justify="space-between" wrap="nowrap">
                  <Text size="sm" lineClamp={1}>{item.label}</Text>
                  <Group gap="xs" wrap="nowrap">
                    <Badge size="sm" color={item.status === "completed" ? "green" : item.status === "failed" ? "red" : "gray"} variant="light">
                      {item.status}
                    </Badge>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{item.when}</Text>
                  </Group>
                </Group>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">No completed AI jobs yet.</Text>
          )}
        </Paper>

        <Paper withBorder p="sm" bg="#fbfaf8">
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {costByBookMap.size} cost source(s) tracked
            </Text>
            <Link href="/settings/geek-analytics" style={{ textDecoration: "underline", fontSize: 12 }}>
              Full engineering telemetry: run tables, job health, snapshot provenance →
            </Link>
          </Group>
        </Paper>
      </Stack>
    </Container>
  );
}

function MetricCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text size="xl" fw={800} mt={4} c={`${tone}.7`}>{value}</Text>
      {sub && <Text size="xs" c="dimmed">{sub}</Text>}
    </Paper>
  );
}
