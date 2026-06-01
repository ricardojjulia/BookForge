import { describe, expect, it } from "vitest";
import { summarizeFreshnessEvents, type FreshnessEventRow } from "@/lib/freshness/analytics";

describe("summarizeFreshnessEvents", () => {
  it("aggregates counts per event and route", () => {
    const rows: FreshnessEventRow[] = [
      {
        event_name: "freshness_refresh_attempt",
        route_key: "dashboard:books",
        status: "stale",
        reason: "manual",
        age_ms: 100,
        error: null,
        occurred_at: "2026-06-01T10:00:00.000Z",
      },
      {
        event_name: "freshness_refresh_success",
        route_key: "dashboard:books",
        status: "stale",
        reason: "manual",
        age_ms: 100,
        error: null,
        occurred_at: "2026-06-01T10:00:01.000Z",
      },
      {
        event_name: "freshness_forced_refresh_triggered",
        route_key: "books:detail",
        status: "expired",
        reason: "forced",
        age_ms: 100,
        error: null,
        occurred_at: "2026-06-01T11:00:00.000Z",
      },
      {
        event_name: "freshness_refresh_attempt",
        route_key: "books:detail",
        status: "expired",
        reason: "forced",
        age_ms: 100,
        error: null,
        occurred_at: "2026-06-01T11:00:01.000Z",
      },
      {
        event_name: "freshness_refresh_failed",
        route_key: "books:detail",
        status: "expired",
        reason: "forced",
        age_ms: 100,
        error: "blocked",
        occurred_at: "2026-06-01T11:00:02.000Z",
      },
    ];

    const summary = summarizeFreshnessEvents(rows);

    expect(summary.totalEvents).toBe(5);
    expect(summary.byEvent.freshness_refresh_attempt).toBe(2);
    expect(summary.byEvent.freshness_refresh_success).toBe(1);
    expect(summary.byEvent.freshness_refresh_failed).toBe(1);
    expect(summary.byEvent.freshness_forced_refresh_triggered).toBe(1);

    const dashboard = summary.routes.find((route) => route.routeKey === "dashboard:books");
    expect(dashboard?.attempts).toBe(1);
    expect(dashboard?.successes).toBe(1);
    expect(dashboard?.successRate).toBe(100);

    const bookDetail = summary.routes.find((route) => route.routeKey === "books:detail");
    expect(bookDetail?.forcedTriggers).toBe(1);
    expect(bookDetail?.failures).toBe(1);
    expect(bookDetail?.successRate).toBe(0);

    expect(summary.latestFailures).toHaveLength(1);
    expect(summary.latestFailures[0]?.error).toBe("blocked");
  });
});
