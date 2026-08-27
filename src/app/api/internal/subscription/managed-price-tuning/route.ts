import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isManagedSaasDeployment } from "@/lib/deployment/mode";
import { runManagedPriceTuningPass } from "@/lib/subscription/managed-price-tuning";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Managed price tuning dispatcher is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Managed tiers only ever exist in managed_saas -- self-hosted has no
  // subscribers to tune price for, same no-op boundary as enforcement.ts.
  if (!isManagedSaasDeployment()) {
    return NextResponse.json({ skipped: true, reason: "Not a managed-SaaS deployment." });
  }

  try {
    const outcomes = await runManagedPriceTuningPass(createAdminClient());
    return NextResponse.json({ outcomes });
  } catch (error) {
    console.error("Managed price tuning pass failed", error);
    return NextResponse.json({ error: "Managed price tuning pass failed." }, { status: 500 });
  }
}

function isAuthorized(authorization: string | null, cronSecret: string) {
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(authorization || "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
