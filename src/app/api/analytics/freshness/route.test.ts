import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/analytics/freshness/route";

const mockGetUser = vi.fn();
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const ltCalls: Array<{ table: string; column: string; value: unknown }> = [];

let eventsResponse: { data: unknown[]; error: unknown; count: number | null } = { data: [], error: null, count: 0 };
let routesResponse: { data: unknown[]; error: unknown; count: number | null } = { data: [], error: null, count: null };
let alertsResponse: { data: unknown[]; error: unknown; count: number | null } = { data: [], error: null, count: null };

function makeBuilder(table: string) {
  const state: { selectedColumns: string } = { selectedColumns: "" };

  const builder = {
    select(columns: string) {
      state.selectedColumns = columns;
      return builder;
    },
    eq(column: string, value: unknown) {
      eqCalls.push({ table, column, value });
      return builder;
    },
    gte() {
      return builder;
    },
    order() {
      return builder;
    },
    lt(column: string, value: unknown) {
      ltCalls.push({ table, column, value });
      return builder;
    },
    is() {
      return builder;
    },
    limit() {
      if (table === "freshness_events" && state.selectedColumns.startsWith("id,event_name")) {
        return Promise.resolve(eventsResponse);
      }
      if (table === "freshness_events" && state.selectedColumns === "route_key") {
        return Promise.resolve(routesResponse);
      }
      if (table === "freshness_alerts") {
        return Promise.resolve(alertsResponse);
      }
      return Promise.resolve({ data: [], error: null, count: null });
    },
  };

  return builder;
}

const mockFrom = vi.fn((table: string) => makeBuilder(table));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

describe("GET /api/analytics/freshness", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const response = await GET(new Request("http://localhost/api/analytics/freshness"));
    expect(response.status).toBe(401);
  });

  it("applies cursor pagination and filters", async () => {
    eqCalls.length = 0;
    ltCalls.length = 0;
    eventsResponse = {
      data: [
        {
          id: "row-1",
          event_name: "freshness_refresh_failed",
          route_key: "dashboard:books",
          status: "stale",
          reason: "manual",
          age_ms: 1,
          error: "boom",
          occurred_at: "2026-06-01T11:00:00.000Z",
        },
      ],
      error: null,
      count: 1,
    };
    routesResponse = { data: [{ route_key: "dashboard:books" }], error: null, count: null };
    alertsResponse = { data: [], error: null, count: null };
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });

    const response = await GET(
      new Request("http://localhost/api/analytics/freshness?window=7d&routeKey=dashboard%3Abooks&eventName=freshness_refresh_failed&status=stale&limit=25&cursor=2026-06-01T12%3A00%3A00.000Z"),
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(eqCalls.some((call) => call.column === "user_id" && call.value === "user-1")).toBe(true);
    expect(eqCalls.some((call) => call.column === "route_key" && call.value === "dashboard:books")).toBe(true);
    expect(eqCalls.some((call) => call.column === "event_name" && call.value === "freshness_refresh_failed")).toBe(true);
    expect(eqCalls.some((call) => call.column === "status" && call.value === "stale")).toBe(true);
    expect(ltCalls.some((call) => call.column === "occurred_at")).toBe(true);

    expect(payload.window).toBe("7d");
    expect(payload.routeKey).toBe("dashboard:books");
    expect(payload.eventName).toBe("freshness_refresh_failed");
    expect(payload.status).toBe("stale");
    expect(payload.pagination.limit).toBe(25);
    expect(payload.pagination.returned).toBe(1);
  });

  it("clamps limit above max via schema", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-2" } } });

    const response = await GET(
      new Request("http://localhost/api/analytics/freshness?limit=999"),
    );

    expect(response.status).toBe(400);
  });
});
