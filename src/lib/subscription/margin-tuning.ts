import type { createAdminClient } from "@/lib/supabase/admin";
import { TARGET_MARGIN, TARGET_MARGIN_MANAGED } from "@/lib/subscription/margin-targets";
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

// "Credit cap ($)" column from the same table, expressed as a multiplier of
// typical cost (e.g. Starter's $3.60 cap on ~$1.20 typical cost is ~3x). The
// job keeps the cap at this multiple of *real, trailing* typical cost so the
// spike buffer doesn't go stale as usage patterns evolve -- this is the literal
// mechanism behind "a margin big enough for spikes, but not big enough to shoo
// users away."
const TARGET_CAP_MULTIPLIER: Record<string, number> = { starter: 3, pro: 2.1, studio: 2, publisher: 1.9 };

const MARGIN_TOLERANCE = 0.05; // don't propose an allowlist review over noise inside +/-5 points
const MAX_CAP_STEP_FRACTION = 0.15; // circuit breaker: block instead of applying an oversized move
const MIN_CAP_STEP_TO_ACT_FRACTION = 0.02; // don't churn the log over sub-2% drift
const MIN_ACTIVE_USER_DAYS = 10; // don't tune off a handful of test calls
const TRAILING_WINDOW_DAYS = 30;

export type MarginTuningOutcome = {
  tierId: string;
  status: "applied" | "blocked" | "proposed" | "skipped";
  field: "credit_cap" | "model_allowlist" | null;
  oldValue: string | null;
  newValue: string | null;
  triggerMetric: Record<string, unknown>;
};

/**
 * The bounded, audited half of autonomous margin tuning (see
 * docs -- delegated-purring-grove.md's "Autonomous Tuning Design"). Two levers,
 * deliberately treated differently:
 *
 * - credit_cap: auto-applied within a capped step (MAX_CAP_STEP_FRACTION), because
 *   a tier's cap is only ever read into a user's balance at grant time (signup, or
 *   a future period-reset) -- see reserve_ai_credits/grant_tier_credits -- so
 *   retuning it can never silently change what an existing subscriber gets
 *   mid-cycle. An oversized computed move blocks instead of applying (circuit
 *   breaker), and is logged either way.
 * - model_allowlist: never auto-applied. is_model_allowed_for_user() is a live,
 *   unversioned lookup, so an allowlist change has no way to defer to an existing
 *   subscriber's next period today -- applying one immediately would be exactly
 *   the failure mode this design exists to prevent. Only ever logged as 'proposed'
 *   for a human to act on.
 *
 * Every non-skipped decision is logged to pricing_adjustment_log, applied or not,
 * so the Steward dashboard shows the full trail, not just the changes that landed.
 */
export async function runMarginTuningPass(supabase: AdminSupabase, now: Date = new Date()): Promise<MarginTuningOutcome[]> {
  const { data: tiers, error: tiersError } = await supabase
    .from("subscription_tiers")
    .select("id,monthly_price_usd_cents,monthly_credit_cap_usd_micros,funding_model")
    .eq("is_active", true);
  if (tiersError || !tiers) return [];

  const { data: stats, error: statsError } = await supabase.rpc("tier_margin_daily_stats", { p_days: TRAILING_WINDOW_DAYS });
  if (statsError || !stats) return [];

  const outcomes: MarginTuningOutcome[] = [];

  for (const tier of tiers) {
    const isManaged = tier.funding_model === "bookforge_managed";
    // Managed tiers use their own target-margin table (credit-cap tuning is
    // frozen for them -- see below -- so capMultiplier is only ever needed
    // for the self-funded branch, and TARGET_CAP_MULTIPLIER deliberately has
    // no managed-tier entries).
    const targetMargin = isManaged ? TARGET_MARGIN_MANAGED[tier.id] : TARGET_MARGIN[tier.id];
    const capMultiplier = TARGET_CAP_MULTIPLIER[tier.id];
    if (targetMargin === undefined || (!isManaged && capMultiplier === undefined)) continue;

    const tierStats = (stats as TierMarginDailyStatsRow[]).filter((row) => row.tier_id === tier.id);
    const totalActiveUserDays = tierStats.reduce((sum, row) => sum + Number(row.active_users), 0);
    if (totalActiveUserDays < MIN_ACTIVE_USER_DAYS) {
      outcomes.push({ tierId: tier.id, status: "skipped", field: null, oldValue: null, newValue: null, triggerMetric: { totalActiveUserDays, minRequired: MIN_ACTIVE_USER_DAYS } });
      continue;
    }

    const totalCostUsdMicros = tierStats.reduce((sum, row) => sum + Number(row.total_cost_usd_micros), 0);
    const weightedAvgCostPerActiveUserDay = totalCostUsdMicros / totalActiveUserDays;
    const impliedMonthlyCostPerUserUsdMicros = Math.round(weightedAvgCostPerActiveUserDay * 30);

    const monthlyPriceUsdMicros = tier.monthly_price_usd_cents * 10_000;
    const typicalMargin =
      monthlyPriceUsdMicros > 0 ? (monthlyPriceUsdMicros - impliedMonthlyCostPerUserUsdMicros) / monthlyPriceUsdMicros : 0;

    const baseTriggerMetric = {
      windowDays: TRAILING_WINDOW_DAYS,
      totalActiveUserDays,
      impliedMonthlyCostPerUserUsdMicros,
      typicalMargin: Number(typicalMargin.toFixed(4)),
      targetMargin,
    };

    // Credit-cap tuning is frozen for bookforge_managed tiers -- unlike
    // self-funded tiers, where the cap is a free lever (the user's own
    // OpenRouter account pays for tokens, not BookForge), a managed tier's
    // cap is a literal ceiling on real cash BookForge pays out per
    // subscriber. Raising it automatically would directly increase
    // BookForge's cost, the opposite of a free lever. See
    // src/lib/subscription/managed-price-tuning.ts, which tunes PRICE
    // instead for these tiers, holding the cap fixed.
    if (!isManaged && capMultiplier !== undefined) {
      const currentCapUsdMicros = tier.monthly_credit_cap_usd_micros;
      const desiredCapUsdMicros = Math.round(capMultiplier * impliedMonthlyCostPerUserUsdMicros);
      const stepFraction = currentCapUsdMicros > 0 ? (desiredCapUsdMicros - currentCapUsdMicros) / currentCapUsdMicros : 0;

      if (Math.abs(stepFraction) > MAX_CAP_STEP_FRACTION) {
        const triggerMetric = { ...baseTriggerMetric, desiredCapUsdMicros, stepFraction: Number(stepFraction.toFixed(4)), maxStepFraction: MAX_CAP_STEP_FRACTION };
        outcomes.push({ tierId: tier.id, status: "blocked", field: "credit_cap", oldValue: String(currentCapUsdMicros), newValue: String(currentCapUsdMicros), triggerMetric });
        await logPricingAdjustment(supabase, tier.id, "credit_cap", String(currentCapUsdMicros), String(currentCapUsdMicros), triggerMetric, "blocked", now);
      } else if (Math.abs(stepFraction) >= MIN_CAP_STEP_TO_ACT_FRACTION) {
        const { error: updateError } = await supabase
          .from("subscription_tiers")
          .update({ monthly_credit_cap_usd_micros: desiredCapUsdMicros, updated_at: now.toISOString() })
          .eq("id", tier.id);
        if (!updateError) {
          const triggerMetric = { ...baseTriggerMetric, stepFraction: Number(stepFraction.toFixed(4)) };
          outcomes.push({ tierId: tier.id, status: "applied", field: "credit_cap", oldValue: String(currentCapUsdMicros), newValue: String(desiredCapUsdMicros), triggerMetric });
          await logPricingAdjustment(supabase, tier.id, "credit_cap", String(currentCapUsdMicros), String(desiredCapUsdMicros), triggerMetric, "applied", now);
        }
      }
    }

    if (typicalMargin < targetMargin - MARGIN_TOLERANCE) {
      outcomes.push({ tierId: tier.id, status: "proposed", field: "model_allowlist", oldValue: null, newValue: null, triggerMetric: baseTriggerMetric });
      await logPricingAdjustment(supabase, tier.id, "model_allowlist", null, null, baseTriggerMetric, "proposed", nextCalendarMonthStart(now));
    }
  }

  return outcomes;
}

function nextCalendarMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
