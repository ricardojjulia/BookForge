import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { expireLapsedTrialManagedKeys } from "@/lib/subscription/trial-expiry";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Trial-expiry dispatcher is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await expireLapsedTrialManagedKeys(createAdminClient());
    return NextResponse.json(result);
  } catch (error) {
    console.error("Trial-expiry key revocation failed", error);
    return NextResponse.json({ error: "Trial-expiry key revocation failed." }, { status: 500 });
  }
}

function isAuthorized(authorization: string | null, cronSecret: string) {
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(authorization || "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
