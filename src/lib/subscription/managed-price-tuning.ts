import { createRotatedStripePrice, deactivateStripePrice } from "@/lib/billing/tier-price-rotation";
import type { createAdminClient } from "@/lib/supabase/admin";
import { TARGET_MARGIN_MANAGED } from "@/lib/subscription/margin-targets";
import { logPricingAdjustment } from "@/lib/subscription/pricing-adjustment-log";

type AdminSupabase = ReturnType<typeof createAdminClient>;

type TierMarginDailyStatsRow = {
  day: string;
  tier_id: string;
  active_users: number | string;
  call_count: number | string;
  total_cost_usd_micros: number | string;
  avg_cost_per_user_usd_micros: number | string | null;
};

// A public price is far less reversible in practice than an internal ledger
// number -- cheap to change in the DB in one second, not reversible in a
// prospect's memory or already-published marketing collateral. These are
// deliberately tighter than margin-tuning.ts's equivalent cap-tuning
// constants (30 vs 10 active-user-days, 8% vs 15% max step, 3% vs 2% floor).
const MIN_ACTIVE_USER_DAYS_FOR_PRICE_TUNING = 30;
const MAX_PRICE_STEP_FRACTION = 0.08;
const MIN_PRICE_STEP_TO_ACT_FRACTION = 0.03;
// No cap-tuning equivalent -- nobody perceives cadence on an internal
// number, but a price that could move every run would look chaotic on a
// pricing page. Independent of (and redundant with) the monthly cron
// schedule, as a belt-and-suspenders guard against any future cadence change.
const MIN_DAYS_SINCE_LAST_APPLIED_PRICE_CHANGE = 30;
const TRAILING_WINDOW_DAYS = 30;

export type ManagedPriceTuningOutcome = {
  tierId: string;
  status: "applied" | "blocked" | "skipped";
  oldValue: string | null;
  newValue: string | null;
  triggerMetric: Record<string, unknown>;
};

/**
 * The bookforge_managed-tier counterpart to margin-tuning.ts's
 * runMarginTuningPass, with the levers swapped: credit cap is frozen for
 * these tiers (a real cash ceiling, not a free internal number -- see
 * margin-tuning.ts), so the lever here is the subscription PRICE instead.
 * Auto-applied within bounds -- safe because a price rotation only ever
 * affects NEW checkouts (subscription_tiers.stripe_price_id / the new
 * "current" pointer in tier_stripe_prices); every existing subscriber's
 * Stripe subscription keeps its own already-issued price untouched, exactly
 * the property that makes cap-tuning safe to auto-apply today.
 */
export async function runManagedPriceTuningPass(supabase: AdminSupabase, now: Date = new Date()): Promise<ManagedPriceTuningOutcome[]> {
  const { data: tiers, error: tiersError } = await supabase
    .from("subscription_tiers")
    .select("id,monthly_price_usd_cents,stripe_price_id,funding_model")
    .eq("is_active", true)
    .eq("funding_model", "bookforge_managed");
  if (tiersError || !tiers) return [];

  const { data: stats, error: statsError } = await supabase.rpc("tier_margin_daily_stats", { p_days: TRAILING_WINDOW_DAYS });
  if (statsError || !stats) return [];

  const outcomes: ManagedPriceTuningOutcome[] = [];

  for (const tier of tiers) {
    const targetMargin = TARGET_MARGIN_MANAGED[tier.id];
    if (targetMargin === undefined) continue;

    if (!tier.stripe_price_id) {
      // Nothing to rotate yet -- tier was seeded but never wired to a real
      // Stripe Product/Price (see 202608270002_seed_managed_tiers.sql's
      // comment on stripe_price_id being set via a manual one-off step).
      continue;
    }

    const tierStats = (stats as TierMarginDailyStatsRow[]).filter((row) => row.tier_id === tier.id);
    const totalActiveUserDays = tierStats.reduce((sum, row) => sum + Number(row.active_users), 0);
    if (totalActiveUserDays < MIN_ACTIVE_USER_DAYS_FOR_PRICE_TUNING) {
      outcomes.push({
        tierId: tier.id,
        status: "skipped",
        oldValue: null,
        newValue: null,
        triggerMetric: { totalActiveUserDays, minRequired: MIN_ACTIVE_USER_DAYS_FOR_PRICE_TUNING },
      });
      continue;
    }

    const totalCostUsdMicros = tierStats.reduce((sum, row) => sum + Number(row.total_cost_usd_micros), 0);
    const weightedAvgCostPerActiveUserDay = totalCostUsdMicros / totalActiveUserDays;
    const impliedMonthlyCostPerUserUsdMicros = Math.round(weightedAvgCostPerActiveUserDay * 30);

    const currentPriceUsdCents = tier.monthly_price_usd_cents;
    const desiredPriceUsdMicros = Math.round(impliedMonthlyCostPerUserUsdMicros / (1 - targetMargin));
    const desiredPriceUsdCents = Math.round(desiredPriceUsdMicros / 10_000);
    const stepFraction = currentPriceUsdCents > 0 ? (desiredPriceUsdCents - currentPriceUsdCents) / currentPriceUsdCents : 0;

    const baseTriggerMetric = {
      windowDays: TRAILING_WINDOW_DAYS,
      totalActiveUserDays,
      impliedMonthlyCostPerUserUsdMicros,
      targetMargin,
      desiredPriceUsdCents,
      stepFraction: Number(stepFraction.toFixed(4)),
    };

    // Cooldown gate: checked before the step-fraction math is allowed to
    // apply, even if the math alone would qualify.
    const { data: lastApplied } = await supabase
      .from("pricing_adjustment_log")
      .select("effective_at")
      .eq("tier_id", tier.id)
      .eq("field", "subscription_price")
      .eq("status", "applied")
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastApplied?.effective_at) {
      const daysSinceLastApplied = (now.getTime() - new Date(lastApplied.effective_at).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceLastApplied < MIN_DAYS_SINCE_LAST_APPLIED_PRICE_CHANGE) {
        const triggerMetric = { ...baseTriggerMetric, reason: "cooldown", daysSinceLastApplied: Number(daysSinceLastApplied.toFixed(1)) };
        outcomes.push({ tierId: tier.id, status: "blocked", oldValue: String(currentPriceUsdCents), newValue: String(currentPriceUsdCents), triggerMetric });
        await logPricingAdjustment(supabase, tier.id, "subscription_price", String(currentPriceUsdCents), String(currentPriceUsdCents), triggerMetric, "blocked", now);
        continue;
      }
    }

    if (Math.abs(stepFraction) > MAX_PRICE_STEP_FRACTION) {
      const triggerMetric = { ...baseTriggerMetric, maxStepFraction: MAX_PRICE_STEP_FRACTION };
      outcomes.push({ tierId: tier.id, status: "blocked", oldValue: String(currentPriceUsdCents), newValue: String(currentPriceUsdCents), triggerMetric });
      await logPricingAdjustment(supabase, tier.id, "subscription_price", String(currentPriceUsdCents), String(currentPriceUsdCents), triggerMetric, "blocked", now);
    } else if (Math.abs(stepFraction) >= MIN_PRICE_STEP_TO_ACT_FRACTION) {
      const { newPriceId } = await createRotatedStripePrice(tier.stripe_price_id, desiredPriceUsdCents);
      const { error: rpcError } = await supabase.rpc("set_tier_current_stripe_price", {
        p_tier_id: tier.id,
        p_new_stripe_price_id: newPriceId,
      });
      if (!rpcError) {
        await deactivateStripePrice(tier.stripe_price_id).catch(() => {
          // Best-effort -- see deactivateStripePrice's doc comment.
        });
        outcomes.push({ tierId: tier.id, status: "applied", oldValue: String(currentPriceUsdCents), newValue: String(desiredPriceUsdCents), triggerMetric: baseTriggerMetric });
        await logPricingAdjustment(supabase, tier.id, "subscription_price", String(currentPriceUsdCents), String(desiredPriceUsdCents), baseTriggerMetric, "applied", now);
        if (desiredPriceUsdCents > currentPriceUsdCents) {
          // Nothing blocks a price increase, but a human should notice it
          // happened -- no Slack/email channel exists in this repo to wire
          // into yet, so this is the visible signal until one does.
          console.error(
            `[managed-price-tuning] price increase applied: ${tier.id} ${currentPriceUsdCents}c -> ${desiredPriceUsdCents}c`,
          );
        }
      }
    }
  }

  return outcomes;
}
