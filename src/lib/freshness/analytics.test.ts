import { describe, expect, it } from "vitest";
import {
  buildFreshnessTrend,
  filterFreshnessEvents,
  summarizeFreshnessEvents,
  type FreshnessEventRow,
} from "@/lib/freshness/analytics";

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

describe("filterFreshnessEvents", () => {
  const asOf = new Date("2026-06-01T12:00:00.000Z");
  const rows: FreshnessEventRow[] = [
    {
      event_name: "freshness_refresh_attempt",
      route_key: "analytics:runs",
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
      occurred_at: "2026-05-29T10:00:00.000Z",
    },
  ];

  it("filters by 24h window", () => {
    const filtered = filterFreshnessEvents(rows, { windowHours: 24, asOf });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.route_key).toBe("analytics:runs");
  });

  it("filters by route key", () => {
    const filtered = filterFreshnessEvents(rows, {
      windowHours: 168,
      routeKey: "dashboard:books",
      asOf,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.route_key).toBe("dashboard:books");
  });
});

describe("buildFreshnessTrend", () => {
  it("builds six buckets for 24h", () => {
    const asOf = new Date("2026-06-01T12:00:00.000Z");
    const points = buildFreshnessTrend(
      [
        {
          event_name: "freshness_refresh_attempt",
          route_key: "analytics:runs",
          status: "stale",
          reason: "manual",
          age_ms: 100,
          error: null,
          occurred_at: "2026-06-01T11:00:00.000Z",
        },
      ],
      { windowHours: 24, asOf },
    );

    expect(points).toHaveLength(6);
    expect(points.reduce((sum, point) => sum + point.count, 0)).toBe(1);
  });

  it("builds seven buckets for 7d", () => {
    const asOf = new Date("2026-06-07T12:00:00.000Z");
    const points = buildFreshnessTrend([], { windowHours: 168, asOf });

    expect(points).toHaveLength(7);
    expect(points.every((point) => typeof point.label === "string")).toBe(true);
  });
});
