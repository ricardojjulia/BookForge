import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isManagedSaasDeployment } from "@/lib/deployment/mode";
import { runMarginTuningPass } from "@/lib/subscription/margin-tuning";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Margin tuning dispatcher is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Tiers/credit caps only mean anything in managed_saas -- self-hosted has no
  // subscribers to tune margin for, same no-op boundary as enforcement.ts.
  if (!isManagedSaasDeployment()) {
    return NextResponse.json({ skipped: true, reason: "Not a managed-SaaS deployment." });
  }

  try {
    const outcomes = await runMarginTuningPass(createAdminClient());
    return NextResponse.json({ outcomes });
  } catch (error) {
    console.error("Margin tuning pass failed", error);
    return NextResponse.json({ error: "Margin tuning pass failed." }, { status: 500 });
  }
}

function isAuthorized(authorization: string | null, cronSecret: string) {
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(authorization || "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
