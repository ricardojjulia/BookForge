import type { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export type StewardPricingTier = {
  id: string;
  displayName: string;
  monthlyPriceUsdCents: number;
  monthlyCreditCapUsdMicros: number;
  isActive: boolean;
  models: { model: string; task: string }[];
};

export type StewardPricingAdjustment = {
  id: string;
  tierId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  triggerMetric: Record<string, unknown>;
  status: string;
  effectiveAt: string;
  createdAt: string;
};

/**
 * Read-only rollup for the Steward pricing dashboard: live tiers + their model
 * allowlists, and the margin-tuning job's full decision trail (applied, blocked,
 * and proposed rows alike -- see margin-tuning.ts's doc comment). A human can
 * still see (and, outside this read-only view, override) every lever the
 * autonomous tuning job touches.
 */
export async function getStewardPricingOverview(
  admin: AdminSupabase,
  options: { adjustmentLogLimit?: number } = {},
): Promise<{ tiers: StewardPricingTier[]; adjustments: StewardPricingAdjustment[] }> {
  const limit = options.adjustmentLogLimit ?? 50;

  const [tierResult, modelResult, logResult] = await Promise.all([
    admin
      .from("subscription_tiers")
      .select("id,display_name,monthly_price_usd_cents,monthly_credit_cap_usd_micros,is_active,sort_order")
      .order("sort_order"),
    admin.from("subscription_tier_models").select("tier_id,model,task"),
    admin
      .from("pricing_adjustment_log")
      .select("id,tier_id,field,old_value,new_value,trigger_metric,status,effective_at,created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (tierResult.error || !tierResult.data) throw tierResult.error || new Error("Failed to load subscription tiers.");
  if (modelResult.error || !modelResult.data) throw modelResult.error || new Error("Failed to load tier model allowlists.");
  if (logResult.error || !logResult.data) throw logResult.error || new Error("Failed to load the pricing adjustment log.");

  const modelsByTier = new Map<string, { model: string; task: string }[]>();
  for (const row of modelResult.data) {
    const list = modelsByTier.get(row.tier_id) || [];
    list.push({ model: row.model, task: row.task });
    modelsByTier.set(row.tier_id, list);
  }

  const tiers: StewardPricingTier[] = tierResult.data.map((tier) => ({
    id: tier.id,
    displayName: tier.display_name,
    monthlyPriceUsdCents: tier.monthly_price_usd_cents,
    monthlyCreditCapUsdMicros: tier.monthly_credit_cap_usd_micros,
    isActive: tier.is_active,
    models: modelsByTier.get(tier.id) || [],
  }));

  const adjustments: StewardPricingAdjustment[] = logResult.data.map((row) => ({
    id: row.id,
    tierId: row.tier_id,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    triggerMetric: (row.trigger_metric as Record<string, unknown>) || {},
    status: row.status,
    effectiveAt: row.effective_at,
    createdAt: row.created_at,
  }));

  return { tiers, adjustments };
}
