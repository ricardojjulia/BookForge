import { isManagedSaasDeployment } from "@/lib/deployment/mode";
import { computeCostUsdMicros, getCurrentModelPricing } from "@/lib/subscription/pricing";

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
 * Thrown by reserveCreditsForCall when the user's credit balance can't cover
 * a pessimistic (worst-case) estimate of this call's cost, or when the cost
 * can't be verified at all (no pricing row for this model -- fail closed,
 * never treat "unknown cost" as "free"). Callers map this to a 402.
 */
export class InsufficientCreditsError extends Error {
  constructor(model: string, reason: string = "Your plan's credit balance for this billing period is used up.") {
    super(`${reason} (model: ${model})`);
    this.name = "InsufficientCreditsError";
  }
}

// InsufficientCreditsError's message is the only thing that survives the trip
// from server (thrown here) through a route's generic 500 catch-all, into a
// revision_jobs.error_message column or a fetchJson-thrown Error's .message --
// neither preserves error.name or a status code today. Matching on these two
// fixed phrases (both only ever produced by this class's constructor above)
// is what lets the UI show an "out of credits" CTA instead of a plain failure.
const INSUFFICIENT_CREDITS_MARKERS = [
  "credit balance for this billing period is used up",
  "can't be run on a metered plan",
  "spending limit for this billing period is used up",
];

export function isInsufficientCreditsMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return INSUFFICIENT_CREDITS_MARKERS.some((marker) => message.includes(marker));
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

/**
 * The money chokepoint. Reserves a pessimistic (worst-case, from
 * maxOutputTokens -- never underestimates) cost estimate against the user's
 * credit balance via the atomic reserve_ai_credits() RPC, BEFORE the
 * provider is ever invoked. Returns null on self-hosted (true no-op, same
 * pattern as assertModelAllowedForUser) or when there's nothing to reserve
 * against (no telemetry context). Throws InsufficientCreditsError --
 * including when the model has no pricing row, since an unverifiable cost
 * must fail closed, not silently proceed as free.
 *
 * Reconcile the returned reservationId via reconcileCreditReservation() once
 * real completion.usage is known -- this only ever reserves the worst case.
 */
export async function reserveCreditsForCall(
  supabase: SupabaseClient,
  input: { userId: string; model: string; task: string; promptTokensEstimate: number; maxOutputTokens: number; jobId?: string | null },
): Promise<{ reservationId: string } | null> {
  if (!isManagedSaasDeployment()) return null;

  const pricing = await getCurrentModelPricing(supabase, input.model);
  if (!pricing) {
    throw new InsufficientCreditsError(input.model, "This model's cost can't be verified right now, so it can't be run on a metered plan.");
  }

  const estimatedCostUsdMicros = computeCostUsdMicros(input.promptTokensEstimate, input.maxOutputTokens, pricing);

  const { data, error } = await supabase.rpc("reserve_ai_credits", {
    p_user_id: input.userId,
    p_amount_usd_micros: estimatedCostUsdMicros,
    p_model: input.model,
    p_task: input.task,
    p_job_id: input.jobId ?? null,
  });

  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row?.reservation_id) {
    throw new InsufficientCreditsError(input.model);
  }

  return { reservationId: row.reservation_id as string };
}

/**
 * True-up a reservation once real completion.usage is known, refunding the
 * gap between the pessimistic estimate and actual cost. Never throws --
 * unlike reserveCreditsForCall, this runs after the call already completed,
 * so a reconciliation failure must not surface as a user-facing error (the
 * user already got their result); it just means that call's estimate stands
 * uncorrected until the next successful reconciliation.
 */
export async function reconcileCreditReservation(
  supabase: SupabaseClient,
  input: { reservationId: string; actualCostUsdMicros: number; modelCallEventId?: string | null },
): Promise<void> {
  if (!isManagedSaasDeployment()) return;
  try {
    await supabase.rpc("reconcile_ai_credit_reservation", {
      p_reservation_id: input.reservationId,
      p_actual_amount_usd_micros: input.actualCostUsdMicros,
      p_model_call_event_id: input.modelCallEventId ?? null,
    });
  } catch {
    // Best-effort true-up only -- see doc comment above.
  }
}
