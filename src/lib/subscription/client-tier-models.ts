import type { ModelPrice } from "@/lib/ai/model-catalog";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side counterpart to is_model_allowed_for_user()'s tier resolution
 * (active, or trialing with an unexpired trial_ends_at) -- used by
 * "Optimize per feature" to know what it's actually allowed to pick from.
 * Both tables are covered by "readable by any authenticated user" RLS
 * policies (see 202608200001/202608200002_*.sql), so this needs no service
 * role or API route.
 */
export async function fetchAllowedModelsForCurrentUser(): Promise<Set<string>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data: subscription } = await supabase
    .from("user_subscriptions")
    .select("tier_id,status,trial_ends_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const hasActiveTier =
    subscription?.status === "active" ||
    (subscription?.status === "trialing" && !!subscription.trial_ends_at && new Date(subscription.trial_ends_at).getTime() > Date.now());
  if (!hasActiveTier || !subscription?.tier_id) return new Set();

  const { data: models } = await supabase
    .from("subscription_tier_models")
    .select("model")
    .eq("tier_id", subscription.tier_id)
    .eq("task", "*");

  return new Set((models ?? []).map((m) => m.model as string));
}

/**
 * Current (effective_to is null) live-refreshed price per tracked model --
 * see refreshModelPricingFromOpenRouter, which keeps this table current via
 * a daily cron. Readable by any authenticated user (same RLS pattern as
 * fetchAllowedModelsForCurrentUser above). Lets "Optimize per feature"
 * prefer whichever already-vetted, already-allowed model is cheapest right
 * now instead of always taking the first entry in a static priority list --
 * a promo/price move on one of two otherwise-equal options should actually
 * get used, not just tracked for billing.
 */
export async function fetchCurrentModelPricing(): Promise<Map<string, ModelPrice>> {
  const supabase = createClient();
  const { data: rows } = await supabase
    .from("model_pricing")
    .select("model,input_usd_micros_per_million_tokens,output_usd_micros_per_million_tokens")
    .is("effective_to", null);

  return new Map(
    (rows ?? []).map((row) => [
      row.model as string,
      {
        inputUsdMicrosPerMillion: row.input_usd_micros_per_million_tokens as number,
        outputUsdMicrosPerMillion: row.output_usd_micros_per_million_tokens as number,
      },
    ]),
  );
}
