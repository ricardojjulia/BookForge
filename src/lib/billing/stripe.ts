import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Lazy singleton, mirroring createAdminClient()'s pattern of throwing only
 * when actually invoked rather than at import time -- self-hosted builds and
 * boots with STRIPE_SECRET_KEY entirely unset, and must never fail on that.
 */
export function getStripeClient(): Stripe {
  if (cached) return cached;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  cached = new Stripe(secretKey);
  return cached;
}
