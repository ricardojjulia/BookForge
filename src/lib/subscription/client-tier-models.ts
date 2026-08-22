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
