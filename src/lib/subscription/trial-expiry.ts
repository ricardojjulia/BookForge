import { disableManagedOpenRouterKey } from "@/lib/openrouter/management";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

/**
 * Disables the auto-provisioned BookForge-managed OpenRouter key for any
 * trial that lapsed with no purchase, and marks the subscription row
 * 'canceled'. Nothing else ever revokes that key: a real upgrade goes
 * through Stripe's syncOpenRouterManagedKeyLimit webhook path (see
 * src/lib/billing/webhook-handlers.ts), but a trial that simply expires
 * unconverted fires no Stripe event at all -- see
 * src/app/api/onboarding/openrouter-bookforge-managed/route.ts for how the
 * key gets minted in the first place. Without this job, both the key and
 * BookForge's own remaining internal credit balance for that user would
 * stay live and spendable indefinitely past the 14-day trial window.
 */
export async function expireLapsedTrialManagedKeys(supabase: AdminSupabase, now = new Date()) {
  const { data: lapsedTrials, error: trialsError } = await supabase
    .from("user_subscriptions")
    .select("user_id")
    .eq("status", "trialing")
    .lte("trial_ends_at", now.toISOString());
  if (trialsError) throw trialsError;
  if (!lapsedTrials?.length) return { expired: 0, keysDisabled: 0 };

  const userIds = lapsedTrials.map((row) => row.user_id as string);

  const { data: managedKeyRows, error: settingsError } = await supabase
    .from("user_settings")
    .select("user_id, openrouter_scoped_key_hash")
    .in("user_id", userIds)
    .eq("openrouter_scoped_key_funding_model", "bookforge_managed")
    .not("openrouter_scoped_key_hash", "is", null);
  if (settingsError) throw settingsError;

  let keysDisabled = 0;
  if (managedKeyRows?.length) {
    const masterKey = process.env.OPENROUTER_MASTER_MANAGEMENT_KEY;
    if (!masterKey) throw new Error("OPENROUTER_MASTER_MANAGEMENT_KEY is not configured -- cannot disable lapsed trial keys.");

    for (const row of managedKeyRows) {
      try {
        await disableManagedOpenRouterKey(masterKey, row.openrouter_scoped_key_hash as string);
        keysDisabled++;
      } catch (error) {
        // Don't let one bad key (already-deleted on OpenRouter's side, a
        // transient network error) block the rest of the batch or the
        // subscription-status update below -- log it for follow-up instead.
        console.error(`Failed to disable lapsed-trial OpenRouter key for user ${row.user_id}`, error);
      }
    }
  }

  // Re-guard on status = 'trialing' in case a real upgrade raced in between
  // the read above and this write -- that user's row already moved to
  // 'active' via the Stripe webhook and must not be clobbered back to
  // 'canceled' here.
  const { error: updateError } = await supabase
    .from("user_subscriptions")
    .update({ status: "canceled", updated_at: now.toISOString() })
    .in("user_id", userIds)
    .eq("status", "trialing");
  if (updateError) throw updateError;

  return { expired: userIds.length, keysDisabled };
}
