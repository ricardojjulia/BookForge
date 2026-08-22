import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripeClient } from "@/lib/billing/stripe";
import { isManagedSaasDeployment } from "@/lib/deployment/mode";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ tierId: z.string().min(1) });

export async function POST(request: Request) {
  if (!isManagedSaasDeployment()) {
    return NextResponse.json({ error: "Billing isn't available on this deployment." }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const body = schema.parse(await request.json());
    const admin = createAdminClient();

    const { data: tier } = await admin
      .from("subscription_tiers")
      .select("id,stripe_price_id")
      .eq("id", body.tierId)
      .maybeSingle();
    if (!tier?.stripe_price_id) {
      return NextResponse.json({ error: "That plan isn't available for checkout right now." }, { status: 400 });
    }

    const { data: existingSubscription } = await admin
      .from("user_subscriptions")
      .select("status,stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingSubscription?.status === "active") {
      return NextResponse.json(
        { error: "You already have an active subscription. Use \"Manage billing\" to change plans." },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    let customerId = existingSubscription?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { supabase_user_id: user.id } });
      customerId = customer.id;
      if (existingSubscription) {
        // A row already exists here in practice (the signup trigger creates
        // one for every user) -- only attach the new Stripe customer id.
        // Never touch status/tier_id: overwriting a still-valid 'trialing'
        // row to 'incomplete' would revoke trial access the instant someone
        // merely opens checkout, before they've decided whether to pay.
        await admin
          .from("user_subscriptions")
          .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
      } else {
        await admin
          .from("user_subscriptions")
          .insert({ user_id: user.id, stripe_customer_id: customerId, status: "incomplete", updated_at: new Date().toISOString() });
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: tier.stripe_price_id, quantity: 1 }],
      success_url: `${siteUrl}/account?checkout=success`,
      cancel_url: `${siteUrl}/account?checkout=cancel`,
      subscription_data: { metadata: { supabase_user_id: user.id } },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout session creation failed", error);
    return NextResponse.json({ error: "Unable to start checkout." }, { status: 500 });
  }
}
