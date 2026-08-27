import { beforeEach, describe, expect, it, vi } from "vitest";
import { runManagedPriceTuningPass } from "@/lib/subscription/managed-price-tuning";

vi.mock("@/lib/billing/tier-price-rotation", () => ({
  createRotatedStripePrice: vi.fn().mockResolvedValue({ newPriceId: "price_new_123" }),
  deactivateStripePrice: vi.fn().mockResolvedValue(undefined),
}));

import { createRotatedStripePrice, deactivateStripePrice } from "@/lib/billing/tier-price-rotation";

type TierRow = { id: string; monthly_price_usd_cents: number; stripe_price_id: string | null; funding_model: string };
type StatsRow = { tier_id: string; active_users: number; total_cost_usd_micros: number };

function fakeAdminSupabase(input: {
  tiers: TierRow[];
  stats: StatsRow[];
  statsError?: unknown;
  lastAppliedByTier?: Record<string, { effective_at: string } | undefined>;
  rpcError?: unknown;
}) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const insertCalls: { payload: Record<string, unknown> }[] = [];

  const from = vi.fn((table: string) => {
    if (table === "subscription_tiers") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: input.tiers, error: null }),
          }),
        }),
      };
    }
    if (table === "pricing_adjustment_log") {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertCalls.push({ payload });
          return Promise.resolve({ error: null });
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn((_col: string, tierId: string) => ({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: input.lastAppliedByTier?.[tierId] ?? null, error: null }),
                  }),
                }),
              }),
            }),
          })),
        }),
      };
    }
    throw new Error(`fakeAdminSupabase: unexpected table "${table}"`);
  });

  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    if (fn === "tier_margin_daily_stats") return Promise.resolve({ data: input.stats, error: input.statsError ?? null });
    if (fn === "set_tier_current_stripe_price") return Promise.resolve({ error: input.rpcError ?? null });
    return Promise.resolve({ data: null, error: null });
  });

  return { supabase: { from, rpc } as unknown as Parameters<typeof runManagedPriceTuningPass>[0], rpcCalls, insertCalls };
}

describe("runManagedPriceTuningPass", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips a tier with fewer than 30 active-user-days", async () => {
    const tiers: TierRow[] = [{ id: "managed_starter", monthly_price_usd_cents: 1950, stripe_price_id: "price_old", funding_model: "bookforge_managed" }];
    const stats: StatsRow[] = [{ tier_id: "managed_starter", active_users: 15, total_cost_usd_micros: 100_000 }];
    const { supabase, rpcCalls, insertCalls } = fakeAdminSupabase({ tiers, stats });

    const outcomes = await runManagedPriceTuningPass(supabase, new Date("2026-09-01T08:00:00Z"));

    expect(outcomes).toEqual([{ tierId: "managed_starter", status: "skipped", oldValue: null, newValue: null, triggerMetric: { totalActiveUserDays: 15, minRequired: 30 } }]);
    expect(rpcCalls.some((c) => c.fn === "set_tier_current_stripe_price")).toBe(false);
    expect(insertCalls).toHaveLength(0);
  });

  it("skips a tier with no stripe_price_id set yet", async () => {
    const tiers: TierRow[] = [{ id: "managed_starter", monthly_price_usd_cents: 1950, stripe_price_id: null, funding_model: "bookforge_managed" }];
    const stats: StatsRow[] = [{ tier_id: "managed_starter", active_users: 50, total_cost_usd_micros: 100_000 }];
    const { supabase, insertCalls } = fakeAdminSupabase({ tiers, stats });

    const outcomes = await runManagedPriceTuningPass(supabase, new Date("2026-09-01T08:00:00Z"));

    expect(outcomes).toEqual([]);
    expect(insertCalls).toHaveLength(0);
  });

  it("applies a bounded price increase: rotates the Stripe price and logs it", async () => {
    // targetMargin (managed_starter) = 0.93. weightedAvgCostPerActiveUserDay =
    // 1,680,000/35 = 48,000/day -> implied monthly cost = 1,440,000 micros
    // ($1.44). desiredPrice = 1,440,000/(1-0.93) = 20,571,429 micros -> $20.57
    // -> 2057c. current price 1950c -> stepFraction = (2057-1950)/1950 = +5.49%
    // -- a genuine increase, within the [3%, 8%] bound.
    const tiers: TierRow[] = [{ id: "managed_starter", monthly_price_usd_cents: 1950, stripe_price_id: "price_old", funding_model: "bookforge_managed" }];
    const stats: StatsRow[] = [{ tier_id: "managed_starter", active_users: 35, total_cost_usd_micros: 1_680_000 }];
    const { supabase, rpcCalls, insertCalls } = fakeAdminSupabase({ tiers, stats });

    const outcomes = await runManagedPriceTuningPass(supabase, new Date("2026-09-01T08:00:00Z"));

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ tierId: "managed_starter", status: "applied", oldValue: "1950" });
    expect(createRotatedStripePrice).toHaveBeenCalledWith("price_old", Number(outcomes[0].newValue));
    expect(rpcCalls).toContainEqual({ fn: "set_tier_current_stripe_price", args: { p_tier_id: "managed_starter", p_new_stripe_price_id: "price_new_123" } });
    expect(deactivateStripePrice).toHaveBeenCalledWith("price_old");
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].payload).toMatchObject({ tier_id: "managed_starter", field: "subscription_price", status: "applied" });
  });

  it("blocks an oversized price move instead of applying it", async () => {
    // implied monthly cost/user way above what a bounded step from $19.50 could reach.
    const tiers: TierRow[] = [{ id: "managed_starter", monthly_price_usd_cents: 1950, stripe_price_id: "price_old", funding_model: "bookforge_managed" }];
    const stats: StatsRow[] = [{ tier_id: "managed_starter", active_users: 40, total_cost_usd_micros: 8_000_000 }];
    const { supabase, rpcCalls, insertCalls } = fakeAdminSupabase({ tiers, stats });

    const outcomes = await runManagedPriceTuningPass(supabase, new Date("2026-09-01T08:00:00Z"));

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ tierId: "managed_starter", status: "blocked", oldValue: "1950", newValue: "1950" });
    expect(createRotatedStripePrice).not.toHaveBeenCalled();
    expect(rpcCalls.some((c) => c.fn === "set_tier_current_stripe_price")).toBe(false);
    expect(insertCalls[0].payload).toMatchObject({ status: "blocked" });
  });

  it("blocks (cooldown) even a bounded move if the last applied change was under 30 days ago", async () => {
    const tiers: TierRow[] = [{ id: "managed_starter", monthly_price_usd_cents: 1950, stripe_price_id: "price_old", funding_model: "bookforge_managed" }];
    const stats: StatsRow[] = [{ tier_id: "managed_starter", active_users: 35, total_cost_usd_micros: 1_680_000 }]; // same bounded-move shape as the "applies" test
    const { supabase, insertCalls } = fakeAdminSupabase({
      tiers,
      stats,
      lastAppliedByTier: { managed_starter: { effective_at: "2026-08-20T00:00:00Z" } }, // 12 days before "now" below
    });

    const outcomes = await runManagedPriceTuningPass(supabase, new Date("2026-09-01T08:00:00Z"));

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].status).toBe("blocked");
    expect(outcomes[0].triggerMetric.reason).toBe("cooldown");
    expect(createRotatedStripePrice).not.toHaveBeenCalled();
    expect(insertCalls[0].payload).toMatchObject({ status: "blocked" });
  });

  it("does not fail the whole pass when deactivating the old Stripe price fails", async () => {
    vi.mocked(deactivateStripePrice).mockRejectedValueOnce(new Error("stripe down"));
    const tiers: TierRow[] = [{ id: "managed_starter", monthly_price_usd_cents: 1950, stripe_price_id: "price_old", funding_model: "bookforge_managed" }];
    const stats: StatsRow[] = [{ tier_id: "managed_starter", active_users: 35, total_cost_usd_micros: 1_680_000 }];
    const { supabase } = fakeAdminSupabase({ tiers, stats });

    const outcomes = await runManagedPriceTuningPass(supabase, new Date("2026-09-01T08:00:00Z"));

    expect(outcomes[0].status).toBe("applied"); // DB rotation still counts as applied
  });
});
