import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook-handlers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature || "", webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: alreadyProcessed } = await admin
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (alreadyProcessed) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    await handleStripeEvent(admin, event);
  } catch (error) {
    // No event row written on failure -- Stripe retries, and the handlers'
    // upserts/SET-based writes make a retry safe to reprocess from scratch.
    console.error(`Stripe webhook handling failed for event ${event.id} (${event.type})`, error);
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }

  await admin.from("stripe_webhook_events").insert({ id: event.id, type: event.type });

  return NextResponse.json({ ok: true });
}
