import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildFreshnessTrend,
  filterFreshnessEvents,
  summarizeFreshnessEvents,
  type FreshnessEventRow,
  type FreshnessWindowHours,
} from "@/lib/freshness/analytics";

const querySchema = z.object({
  window: z.enum(["24h", "7d"]).optional().default("24h"),
  routeKey: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
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
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
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

    const { data: rows, error, count } = await supabase
      .from("freshness_events")
      .select("event_name,route_key,status,reason,age_ms,error,occurred_at", { count: "exact" })
      .eq("user_id", user.id)
      .gte("occurred_at", windowStart.toISOString())
      .order("occurred_at", { ascending: false })
      .range(parsed.offset, parsed.offset + parsed.limit - 1);

    if (error) {
      throw error;
    }

    const typedRows = (rows ?? []) as FreshnessEventRow[];
    const filteredRows = filterFreshnessEvents(typedRows, {
      windowHours,
      routeKey: parsed.routeKey ?? null,
    });

    const summary = summarizeFreshnessEvents(filteredRows);
    const trend = buildFreshnessTrend(filteredRows, { windowHours });

    return NextResponse.json({
      window: parsed.window,
      routeKey: parsed.routeKey ?? null,
      summary,
      trend,
      rows: filteredRows,
      pagination: {
        limit: parsed.limit,
        offset: parsed.offset,
        returned: filteredRows.length,
        totalInWindow: count ?? filteredRows.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load freshness analytics.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
