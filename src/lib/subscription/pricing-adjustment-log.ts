import type { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

/**
 * Shared audit-trail writer for both automated tuning passes --
 * margin-tuning.ts (credit_cap / model_allowlist, self-funded tiers) and
 * managed-price-tuning.ts (subscription_price, bookforge_managed tiers).
 * Best-effort only: a logging failure must not roll back or repeat the
 * decision that already happened.
 */
export async function logPricingAdjustment(
  supabase: AdminSupabase,
  tierId: string,
  field: "credit_cap" | "model_allowlist" | "subscription_price",
  oldValue: string | null,
  newValue: string | null,
  triggerMetric: Record<string, unknown>,
  status: "applied" | "blocked" | "proposed",
  effectiveAt: Date,
): Promise<void> {
  try {
    await supabase.from("pricing_adjustment_log").insert({
      tier_id: tierId,
      field,
      old_value: oldValue,
      new_value: newValue,
      trigger_metric: triggerMetric,
      status,
      effective_at: effectiveAt.toISOString(),
    });
  } catch {
    // Best-effort audit write only -- see doc comment above.
  }
}
