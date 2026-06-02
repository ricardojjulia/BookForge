import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const eventSchema = z.object({
  name: z.enum([
    "freshness_refresh_attempt",
    "freshness_refresh_success",
    "freshness_refresh_failed",
    "freshness_forced_refresh_triggered",
  ]),
  routeKey: z.string().min(1),
  label: z.string().optional(),
  status: z.enum(["fresh", "stale", "expired"]),
  reason: z.enum(["manual", "forced"]).optional(),
  ageMs: z.number().nonnegative().optional(),
  staleAfterHours: z.number().positive().optional(),
  forceAfterHours: z.number().positive().optional(),
  error: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
});

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to record telemetry.";
}

async function maybeCreateFreshnessAlert(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  routeKey: string;
  eventName: "freshness_refresh_attempt" | "freshness_refresh_success" | "freshness_refresh_failed" | "freshness_forced_refresh_triggered";
}) {
  const now = new Date();

  if (input.eventName === "freshness_refresh_failed") {
    const recentStart = new Date(now);
    recentStart.setMinutes(recentStart.getMinutes() - 15);

    const { count: failureCount } = await input.supabase
      .from("freshness_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("route_key", input.routeKey)
      .eq("event_name", "freshness_refresh_failed")
      .gte("occurred_at", recentStart.toISOString());

    if ((failureCount ?? 0) >= 3) {
      const dedupeStart = new Date(now);
      dedupeStart.setMinutes(dedupeStart.getMinutes() - 30);

      const { count: existingAlertCount } = await input.supabase
        .from("freshness_alerts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", input.userId)
        .eq("route_key", input.routeKey)
        .eq("reason", "repeated_refresh_failures")
        .is("resolved_at", null)
        .gte("created_at", dedupeStart.toISOString());

      if ((existingAlertCount ?? 0) === 0) {
        await input.supabase.from("freshness_alerts").insert({
          user_id: input.userId,
          route_key: input.routeKey,
          reason: "repeated_refresh_failures",
          severity: "critical",
          details: { failureCount: failureCount ?? 0, windowMinutes: 15 },
        });

        console.error("[freshness-alert] repeated refresh failures", {
          userId: input.userId,
          routeKey: input.routeKey,
          failureCount: failureCount ?? 0,
        });
      }
    }
  }

  if (input.eventName === "freshness_forced_refresh_triggered") {
    const recentStart = new Date(now);
    recentStart.setHours(recentStart.getHours() - 1);

    const { count: forcedCount } = await input.supabase
      .from("freshness_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("route_key", input.routeKey)
      .eq("event_name", "freshness_forced_refresh_triggered")
      .gte("occurred_at", recentStart.toISOString());

    if ((forcedCount ?? 0) >= 3) {
      const dedupeStart = new Date(now);
      dedupeStart.setHours(dedupeStart.getHours() - 6);

      const { count: existingAlertCount } = await input.supabase
        .from("freshness_alerts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", input.userId)
        .eq("route_key", input.routeKey)
        .eq("reason", "forced_refresh_loop")
        .is("resolved_at", null)
        .gte("created_at", dedupeStart.toISOString());

      if ((existingAlertCount ?? 0) === 0) {
        await input.supabase.from("freshness_alerts").insert({
          user_id: input.userId,
          route_key: input.routeKey,
          reason: "forced_refresh_loop",
          severity: "warning",
          details: { forcedCount: forcedCount ?? 0, windowHours: 1 },
        });

        console.warn("[freshness-alert] forced refresh loop", {
          userId: input.userId,
          routeKey: input.routeKey,
          forcedCount: forcedCount ?? 0,
        });
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const event = eventSchema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { error } = await supabase.from("freshness_events").insert({
      user_id: user.id,
      event_name: event.name,
      route_key: event.routeKey,
      status: event.status,
      reason: event.reason ?? null,
      age_ms: event.ageMs ?? null,
      stale_after_hours: event.staleAfterHours ?? null,
      force_after_hours: event.forceAfterHours ?? null,
      error: event.error ?? null,
      occurred_at: event.occurredAt ?? new Date().toISOString(),
    });

    if (error) {
      throw error;
    }

    await maybeCreateFreshnessAlert({
      supabase,
      userId: user.id,
      routeKey: event.routeKey,
      eventName: event.name,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
