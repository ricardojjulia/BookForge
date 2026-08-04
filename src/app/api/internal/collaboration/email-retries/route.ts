import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchCollaborationNotificationEmailRetries } from "@/lib/collaboration/email-retries";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Notification email retry dispatcher is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    return NextResponse.json(await dispatchCollaborationNotificationEmailRetries(createAdminClient()));
  } catch (error) {
    console.error("Collaboration notification email retry dispatch failed", error);
    return NextResponse.json({ error: "Notification email retry dispatch failed." }, { status: 500 });
  }
}

function isAuthorized(authorization: string | null, cronSecret: string) {
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(authorization || "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}