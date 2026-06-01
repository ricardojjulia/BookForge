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
