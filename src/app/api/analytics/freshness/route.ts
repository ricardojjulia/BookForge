import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildFreshnessTrend,
  summarizeFreshnessEvents,
  type FreshnessAlertRow,
  type FreshnessEventRow,
  type FreshnessWindowHours,
} from "@/lib/freshness/analytics";
import type { FreshnessStatus } from "@/lib/freshness/policy";
import type { FreshnessTelemetryEventName } from "@/lib/freshness/telemetry";

const querySchema = z.object({
  window: z.enum(["24h", "7d"]).optional().default("24h"),
  routeKey: z.string().min(1).optional(),
  eventName: z.enum([
    "freshness_refresh_attempt",
    "freshness_refresh_success",
    "freshness_refresh_failed",
    "freshness_forced_refresh_triggered",
  ]).optional(),
  status: z.enum(["fresh", "stale", "expired"]).optional(),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  cursor: z.string().datetime().optional(),
});

function toWindowHours(input: "24h" | "7d"): FreshnessWindowHours {
  return input === "7d" ? 168 : 24;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      window: url.searchParams.get("window") ?? undefined,
      routeKey: url.searchParams.get("routeKey") ?? undefined,
      eventName: url.searchParams.get("eventName") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const windowHours = toWindowHours(parsed.window);
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - windowHours);

    let rowsQuery = supabase
      .from("freshness_events")
      .select("id,event_name,route_key,status,reason,age_ms,error,occurred_at", { count: "exact" })
      .eq("user_id", user.id)
      .gte("occurred_at", windowStart.toISOString())
      .order("occurred_at", { ascending: false });

    if (parsed.routeKey) rowsQuery = rowsQuery.eq("route_key", parsed.routeKey);
    if (parsed.eventName) rowsQuery = rowsQuery.eq("event_name", parsed.eventName as FreshnessTelemetryEventName);
    if (parsed.status) rowsQuery = rowsQuery.eq("status", parsed.status as FreshnessStatus);
    if (parsed.cursor) rowsQuery = rowsQuery.lt("occurred_at", parsed.cursor);

    const { data: rows, error, count } = await rowsQuery.limit(parsed.limit + 1);

    if (error) {
      throw error;
    }

    const typedRows = (rows ?? []) as FreshnessEventRow[];
    const hasMore = typedRows.length > parsed.limit;
    const pageRows = hasMore ? typedRows.slice(0, parsed.limit) : typedRows;
    const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.occurred_at ?? null : null;

    const summary = summarizeFreshnessEvents(pageRows);
    const trend = buildFreshnessTrend(pageRows, { windowHours });

    let routesQuery = supabase
      .from("freshness_events")
      .select("route_key")
      .eq("user_id", user.id)
      .gte("occurred_at", windowStart.toISOString())
      .order("route_key", { ascending: true });

    if (parsed.eventName) routesQuery = routesQuery.eq("event_name", parsed.eventName as FreshnessTelemetryEventName);
    if (parsed.status) routesQuery = routesQuery.eq("status", parsed.status as FreshnessStatus);

    const { data: routeRows } = await routesQuery.limit(1000);
    const availableRoutes = Array.from(
      new Set(
        (routeRows ?? [])
          .map((row) => row.route_key)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    );

    let alertsQuery = supabase
      .from("freshness_alerts")
      .select("id,route_key,reason,severity,details,created_at,resolved_at")
      .eq("user_id", user.id)
      .gte("created_at", windowStart.toISOString())
      .order("created_at", { ascending: false });

    if (parsed.routeKey) alertsQuery = alertsQuery.eq("route_key", parsed.routeKey);

    const { data: alerts } = await alertsQuery.limit(20);

    return NextResponse.json({
      window: parsed.window,
      routeKey: parsed.routeKey ?? null,
      eventName: parsed.eventName ?? null,
      status: parsed.status ?? null,
      summary,
      trend,
      rows: pageRows,
      alerts: (alerts ?? []) as FreshnessAlertRow[],
      availableRoutes,
      pagination: {
        limit: parsed.limit,
        returned: pageRows.length,
        totalInWindow: count ?? pageRows.length,
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load freshness analytics.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
