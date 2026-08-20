import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { refreshModelPricingFromOpenRouter } from "@/lib/subscription/pricing-refresh";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Pricing refresh dispatcher is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const changes = await refreshModelPricingFromOpenRouter(createAdminClient());
    return NextResponse.json({ changed: changes.length, changes });
  } catch (error) {
    console.error("Model pricing refresh failed", error);
    return NextResponse.json({ error: "Model pricing refresh failed." }, { status: 500 });
  }
}

function isAuthorized(authorization: string | null, cronSecret: string) {
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(authorization || "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
