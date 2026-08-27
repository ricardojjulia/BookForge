import type Stripe from "stripe";
import { getStripeClient } from "@/lib/billing/stripe";

/**
 * Creates a new Stripe Price under the SAME Product as currentStripePriceId
 * (retrieved live from Stripe -- subscription_tiers has no stored product
 * id), matching its currency/recurring interval. Does not touch any
 * database row -- the caller must rotate "current" atomically via the
 * set_tier_current_stripe_price RPC (see
 * supabase/migrations/202608280001_tier_stripe_price_history.sql) and
 * should best-effort deactivate the old price afterward via
 * deactivateStripePrice below.
 */
export async function createRotatedStripePrice(
  currentStripePriceId: string,
  newUnitAmountUsdCents: number,
): Promise<{ newPriceId: string }> {
  const stripe = getStripeClient();
  const currentPrice = await stripe.prices.retrieve(currentStripePriceId);
  const productId = typeof currentPrice.product === "string" ? currentPrice.product : currentPrice.product.id;

  const newPrice = await stripe.prices.create({
    product: productId,
    unit_amount: newUnitAmountUsdCents,
    currency: currentPrice.currency,
    recurring: currentPrice.recurring
      ? {
          // Stripe's read-side `Price.Recurring.Interval` type includes a
          // forward-compat `OtherString` branded escape hatch the create-side
          // `PriceCreateParams.Recurring.Interval` literal union doesn't
          // accept -- narrow it back, since in practice this is always one
          // of the real known interval values a Price was actually created with.
          interval: currentPrice.recurring.interval as Stripe.PriceCreateParams.Recurring.Interval,
          interval_count: currentPrice.recurring.interval_count,
        }
      : undefined,
  });

  return { newPriceId: newPrice.id };
}

/**
 * Best-effort: prevents the OLD price from ever being selected for a NEW
 * Stripe checkout (defense in depth beyond the DB routing change) --
 * existing subscriptions keep billing fine on an inactive price. Failure
 * here is non-fatal; a stray still-active old price is cosmetic clutter
 * only, since the DB rotation already redirected all new-checkout traffic.
 */
export async function deactivateStripePrice(stripePriceId: string): Promise<void> {
  await getStripeClient().prices.update(stripePriceId, { active: false });
}
