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

export async function POST(request: Request) {
  try {
    const event = eventSchema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    console.info("[freshness-telemetry]", {
      userId: user?.id ?? null,
      ...event,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
