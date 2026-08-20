import type Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

/**
 * Thrown for a Stripe event that can't be safely processed (e.g. a price id
 * with no matching tier). Left uncaught by the caller on purpose -- the
 * webhook route lets this surface as a 500 so Stripe retries rather than
 * silently mis-provisioning a user's tier from a guess.
 */
export class UnprocessableStripeEventError extends Error {}

function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/** Collapses Stripe's subscription status vocabulary onto user_subscriptions' 3-value enum. */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): "active" | "past_due" | "canceled" {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid" || stripeStatus === "incomplete") return "past_due";
  return "canceled";
}

async function resolveTierIdForPrice(admin: AdminSupabase, priceId: string): Promise<string> {
  const { data, error } = await admin.from("subscription_tiers").select("id").eq("stripe_price_id", priceId).maybeSingle();
  if (error || !data) {
    throw new UnprocessableStripeEventError(`No subscription_tiers row has stripe_price_id "${priceId}".`);
  }
  return data.id;
}

/**
 * A brand-new subscription -- fired once, regardless of whether it came from
 * our Checkout flow, the Dashboard, or the API directly. Preferred over
 * checkout.session.completed: subscription_data.metadata set at Checkout
 * Session creation time is copied onto the resulting Subscription object, so
 * this event already carries supabase_user_id plus the price/period fields
 * directly -- no extra Stripe API round-trip needed inside the webhook.
 */
async function handleSubscriptionCreated(admin: AdminSupabase, subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata?.supabase_user_id;
  if (!userId) return; // not attributable to a user (e.g. created outside our checkout flow) -- nothing to do

  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) throw new UnprocessableStripeEventError(`Subscription ${subscription.id} has no price on its first item.`);
  const tierId = await resolveTierIdForPrice(admin, priceId);

  const { error: upsertError } = await admin.from("user_subscriptions").upsert(
    {
      user_id: userId,
      tier_id: tierId,
      status: mapStripeStatus(subscription.status),
      current_period_start: toIso(subscription.items.data[0].current_period_start),
      current_period_end: toIso(subscription.items.data[0].current_period_end),
      stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripe_subscription_id: subscription.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upsertError) throw upsertError;

  const { error: grantError } = await admin.rpc("grant_tier_credits", { p_user_id: userId, p_kind: "grant" });
  if (grantError) throw grantError;
}

/** Renewal payment. Resets credits for the new period -- the first real trigger for the "next billing period" semantics the tier system was designed around. */
async function handleInvoicePaid(admin: AdminSupabase, invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = invoice.lines.data[0]?.subscription;
  const subscriptionIdString = typeof subscriptionId === "string" ? subscriptionId : subscriptionId?.id;
  if (!subscriptionIdString) return; // one-off invoice, not subscription billing -- nothing to do

  const { data: existing, error: lookupError } = await admin
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscriptionIdString)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) return; // no local row yet (e.g. very first invoice, ahead of subscription.created) -- creation handles the initial grant

  const period = invoice.lines.data[0]?.period;
  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (period) {
    updates.current_period_start = toIso(period.start);
    updates.current_period_end = toIso(period.end);
  }

  const { error: updateError } = await admin.from("user_subscriptions").update(updates).eq("user_id", existing.user_id);
  if (updateError) throw updateError;

  const { error: resetError } = await admin.rpc("grant_tier_credits", { p_user_id: existing.user_id, p_kind: "period_reset" });
  if (resetError) throw resetError;
}

/** Degrades status only -- is_model_allowed_for_user()/get_user_subscription_tier() already coalesce a non-active subscription down to Starter, so no separate enforcement change is needed here. */
async function handleInvoicePaymentFailed(admin: AdminSupabase, invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = invoice.lines.data[0]?.subscription;
  const subscriptionIdString = typeof subscriptionId === "string" ? subscriptionId : subscriptionId?.id;
  if (!subscriptionIdString) return;

  const { error } = await admin
    .from("user_subscriptions")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscriptionIdString);
  if (error) throw error;
}

/** Covers Portal-initiated plan changes and cancel-at-period-end status transitions on an existing subscription. */
async function handleSubscriptionUpdated(admin: AdminSupabase, subscription: Stripe.Subscription): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) throw new UnprocessableStripeEventError(`Subscription ${subscription.id} has no price on its first item.`);
  const tierId = await resolveTierIdForPrice(admin, priceId);

  const { error } = await admin
    .from("user_subscriptions")
    .update({
      tier_id: tierId,
      status: mapStripeStatus(subscription.status),
      current_period_start: toIso(subscription.items.data[0].current_period_start),
      current_period_end: toIso(subscription.items.data[0].current_period_end),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);
  if (error) throw error;
}

/** tier_id is left as-is on cancellation -- a non-active status already makes the enforcement RPCs ignore it and fall back to Starter, so there's nothing else to reset. */
async function handleSubscriptionDeleted(admin: AdminSupabase, subscription: Stripe.Subscription): Promise<void> {
  const { error } = await admin
    .from("user_subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id);
  if (error) throw error;
}

export async function handleStripeEvent(admin: AdminSupabase, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
      return handleSubscriptionCreated(admin, event.data.object as Stripe.Subscription);
    case "invoice.paid":
      return handleInvoicePaid(admin, event.data.object as Stripe.Invoice);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(admin, event.data.object as Stripe.Invoice);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(admin, event.data.object as Stripe.Subscription);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
    default:
      return; // not an event type we act on
  }
}
