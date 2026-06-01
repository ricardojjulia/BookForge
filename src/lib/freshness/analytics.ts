import type { FreshnessStatus } from "@/lib/freshness/policy";
import type { FreshnessRefreshReason, FreshnessTelemetryEventName } from "@/lib/freshness/telemetry";

export type FreshnessEventRow = {
  event_name: FreshnessTelemetryEventName;
  route_key: string;
  status: FreshnessStatus;
  reason: FreshnessRefreshReason | null;
  age_ms: number | null;
  error: string | null;
  occurred_at: string;
};

export type FreshnessRouteSummary = {
  routeKey: string;
  total: number;
  attempts: number;
  successes: number;
  failures: number;
  forcedTriggers: number;
  successRate: number | null;
  lastOccurredAt: string | null;
};

export type FreshnessSummary = {
  totalEvents: number;
  byEvent: Record<FreshnessTelemetryEventName, number>;
  routes: FreshnessRouteSummary[];
  latestFailures: Array<{
    routeKey: string;
    error: string;
    occurredAt: string;
  }>;
};

export type FreshnessWindowHours = 24 | 168;

export type FreshnessTrendBucket = {
  label: string;
  count: number;
};

export function filterFreshnessEvents(
  rows: FreshnessEventRow[],
  input: {
    windowHours: FreshnessWindowHours;
    routeKey?: string | null;
    asOf?: Date;
  },
) {
  const asOf = input.asOf ?? new Date();
  const start = new Date(asOf);
  start.setHours(start.getHours() - input.windowHours);

  return rows.filter((row) => {
    const occurredAt = new Date(row.occurred_at);
    if (!Number.isFinite(occurredAt.getTime())) return false;
    if (occurredAt.getTime() < start.getTime() || occurredAt.getTime() > asOf.getTime()) return false;
    if (input.routeKey && row.route_key !== input.routeKey) return false;
    return true;
  });
}

export function buildFreshnessTrend(
  rows: FreshnessEventRow[],
  input: {
    windowHours: FreshnessWindowHours;
    asOf?: Date;
  },
): FreshnessTrendBucket[] {
  const asOf = input.asOf ?? new Date();

  if (input.windowHours === 24) {
    const bucketSizeHours = 4;
    const buckets = Array.from({ length: 6 }, (_, index) => {
      const end = new Date(asOf);
      end.setHours(end.getHours() - (5 - index) * bucketSizeHours);
      const start = new Date(end);
      start.setHours(start.getHours() - bucketSizeHours);
      const label = `${start.getHours().toString().padStart(2, "0")}-${end.getHours().toString().padStart(2, "0")}`;
      return { start, end, label, count: 0 };
    });

    for (const row of rows) {
      const occurredAt = new Date(row.occurred_at);
      const match = buckets.find((bucket) => occurredAt.getTime() > bucket.start.getTime() && occurredAt.getTime() <= bucket.end.getTime());
      if (match) match.count += 1;
    }

    return buckets.map(({ label, count }) => ({ label, count }));
  }

  const buckets = Array.from({ length: 7 }, (_, index) => {
    const end = new Date(asOf);
    end.setDate(end.getDate() - (6 - index));
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    const label = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return { start, end, label, count: 0 };
  });

  for (const row of rows) {
    const occurredAt = new Date(row.occurred_at);
    const match = buckets.find((bucket) => occurredAt.getTime() >= bucket.start.getTime() && occurredAt.getTime() <= bucket.end.getTime());
    if (match) match.count += 1;
  }

  return buckets.map(({ label, count }) => ({ label, count }));
}

const EVENT_NAMES: FreshnessTelemetryEventName[] = [
  "freshness_refresh_attempt",
  "freshness_refresh_success",
  "freshness_refresh_failed",
  "freshness_forced_refresh_triggered",
];

export function summarizeFreshnessEvents(rows: FreshnessEventRow[]): FreshnessSummary {
  const byEvent = EVENT_NAMES.reduce<Record<FreshnessTelemetryEventName, number>>((acc, eventName) => {
    acc[eventName] = 0;
    return acc;
  }, {} as Record<FreshnessTelemetryEventName, number>);

  const routeMap = new Map<string, FreshnessRouteSummary>();
  const failures: Array<{ routeKey: string; error: string; occurredAt: string }> = [];

  for (const row of rows) {
    byEvent[row.event_name] += 1;

    if (!routeMap.has(row.route_key)) {
      routeMap.set(row.route_key, {
        routeKey: row.route_key,
        total: 0,
        attempts: 0,
        successes: 0,
        failures: 0,
        forcedTriggers: 0,
        successRate: null,
        lastOccurredAt: null,
      });
    }

    const routeSummary = routeMap.get(row.route_key)!;
    routeSummary.total += 1;

    if (!routeSummary.lastOccurredAt || new Date(row.occurred_at).getTime() > new Date(routeSummary.lastOccurredAt).getTime()) {
      routeSummary.lastOccurredAt = row.occurred_at;
    }

    if (row.event_name === "freshness_refresh_attempt") routeSummary.attempts += 1;
    if (row.event_name === "freshness_refresh_success") routeSummary.successes += 1;
    if (row.event_name === "freshness_refresh_failed") {
      routeSummary.failures += 1;
      if (row.error) {
        failures.push({
          routeKey: row.route_key,
          error: row.error,
          occurredAt: row.occurred_at,
        });
      }
    }
    if (row.event_name === "freshness_forced_refresh_triggered") routeSummary.forcedTriggers += 1;
  }

  const routes = Array.from(routeMap.values())
    .map((route) => ({
      ...route,
      successRate: route.attempts > 0 ? Math.round((route.successes / route.attempts) * 100) : null,
    }))
    .sort((a, b) => b.total - a.total);

  const latestFailures = failures
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 5);

  return {
    totalEvents: rows.length,
    byEvent,
    routes,
    latestFailures,
  };
}
