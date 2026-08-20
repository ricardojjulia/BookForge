import { isManagedSaasDeployment } from "@/lib/deployment/mode";

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

/**
 * Thrown by assertModelAllowedForUser when the resolved model isn't in the
 * caller's subscription-tier allowlist. Callers map this to a 403.
 */
export class TierModelNotAllowedError extends Error {
  constructor(model: string, task: string) {
    super(`Model "${model}" isn't available on your plan for this task (${task}). Upgrade your plan or choose a different model.`);
    this.name = "TierModelNotAllowedError";
  }
}

/**
 * Fail-closed pre-flight check: does this user's subscription tier permit
 * calling this model for this task? Self-hosted deployments are a true
 * no-op (isManagedSaasDeployment() is the first check) -- tiers only ever
 * apply in the managed-SaaS deployment. Backed by
 * public.is_model_allowed_for_user(), which defaults an unassigned user to
 * the 'starter' tier (see 202608200001_subscription_tiers.sql).
 *
 * Call this BEFORE the provider is ever invoked -- it must never run after
 * the network call, unlike recordModelCallEvent's fire-and-forget telemetry.
 */
export async function assertModelAllowedForUser(
  supabase: SupabaseClient,
  input: { userId: string; model: string; task: string },
): Promise<void> {
  if (!isManagedSaasDeployment()) return;

  const { data: allowed, error } = await supabase.rpc("is_model_allowed_for_user", {
    p_user_id: input.userId,
    p_model: input.model,
    p_task: input.task,
  });

  // Fail closed: a query error (network blip, RPC missing) is treated as
  // disallowed, not allowed -- the whole point of this check is that a
  // failure must never silently let an ungated call through.
  if (error || !allowed) {
    throw new TierModelNotAllowedError(input.model, input.task);
  }
}

/**
 * Best-effort tier lookup for telemetry snapshotting (see model_call_events.tier_id).
 * Unlike assertModelAllowedForUser, this is never a gate -- returns null rather
 * than throwing, since a telemetry-recording failure must never break a real call.
 */
export async function getUserSubscriptionTier(supabase: SupabaseClient, userId: string): Promise<string | null> {
  if (!isManagedSaasDeployment()) return null;
  const { data, error } = await supabase.rpc("get_user_subscription_tier", { p_user_id: userId });
  if (error || typeof data !== "string") return null;
  return data;
}
