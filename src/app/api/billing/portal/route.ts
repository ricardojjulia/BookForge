import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/billing/stripe";
import { isManagedSaasDeployment } from "@/lib/deployment/mode";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isManagedSaasDeployment()) {
    return NextResponse.json({ error: "Billing isn't available on this deployment." }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const admin = createAdminClient();
    const { data: subscription } = await admin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!subscription?.stripe_customer_id) {
      return NextResponse.json({ error: "You haven't subscribed yet." }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${siteUrl}/account`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe billing portal session creation failed", error);
    return NextResponse.json({ error: "Unable to open billing portal." }, { status: 500 });
  }
}
