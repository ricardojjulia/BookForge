import { describe, expect, it, vi } from "vitest";
import { runMarginTuningPass } from "@/lib/subscription/margin-tuning";

type TierRow = { id: string; monthly_price_usd_cents: number; monthly_credit_cap_usd_micros: number };
type StatsRow = { tier_id: string; active_users: number; total_cost_usd_micros: number };

function fakeAdminSupabase(input: { tiers: TierRow[]; stats: StatsRow[]; statsError?: unknown; updateError?: unknown }) {
  const updateCalls: { table: string; payload: unknown; tierId: string }[] = [];
  const insertCalls: { table: string; payload: Record<string, unknown> }[] = [];

  const from = vi.fn((table: string) => {
    if (table === "subscription_tiers") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: input.tiers, error: null }),
        }),
        update: vi.fn((payload: unknown) => ({
          eq: vi.fn((_col: string, tierId: string) => {
            updateCalls.push({ table, payload, tierId });
            return Promise.resolve({ error: input.updateError ?? null });
          }),
        })),
      };
    }
    if (table === "pricing_adjustment_log") {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertCalls.push({ table, payload });
          return Promise.resolve({ error: null });
        }),
      };
    }
    throw new Error(`fakeAdminSupabase: unexpected table "${table}"`);
  });

  const rpc = vi.fn().mockResolvedValue({ data: input.stats, error: input.statsError ?? null });

  return { supabase: { from, rpc } as unknown as Parameters<typeof runMarginTuningPass>[0], updateCalls, insertCalls };
}

describe("runMarginTuningPass", () => {
  it("skips a tier with too few active-user-days -- no DB writes, no log row", async () => {
    const tiers: TierRow[] = [{ id: "starter", monthly_price_usd_cents: 1500, monthly_credit_cap_usd_micros: 3_600_000 }];
    const stats: StatsRow[] = [{ tier_id: "starter", active_users: 3, total_cost_usd_micros: 10_000 }]; // 3 < MIN_ACTIVE_USER_DAYS
    const { supabase, updateCalls, insertCalls } = fakeAdminSupabase({ tiers, stats });

    const outcomes = await runMarginTuningPass(supabase, new Date("2026-08-20T00:00:00Z"));

    expect(outcomes).toEqual([{ tierId: "starter", status: "skipped", field: null, oldValue: null, newValue: null, triggerMetric: { totalActiveUserDays: 3, minRequired: 10 } }]);
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("auto-applies a bounded credit-cap increase and logs it", async () => {
    // implied monthly cost/user = $1.32 (44,000/day * 30) -> desired cap = 3x = $3.96, a 10% bump from $3.60 -- within the 15% bound.
    const tiers: TierRow[] = [{ id: "starter", monthly_price_usd_cents: 1500, monthly_credit_cap_usd_micros: 3_600_000 }];
    const stats: StatsRow[] = [{ tier_id: "starter", active_users: 20, total_cost_usd_micros: 880_000 }];
    const { supabase, updateCalls, insertCalls } = fakeAdminSupabase({ tiers, stats });

    const outcomes = await runMarginTuningPass(supabase, new Date("2026-08-20T00:00:00Z"));

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ tierId: "starter", status: "applied", field: "credit_cap", oldValue: "3600000", newValue: "3960000" });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ tierId: "starter", payload: { monthly_credit_cap_usd_micros: 3_960_000 } });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].payload).toMatchObject({ tier_id: "starter", field: "credit_cap", status: "applied", old_value: "3600000", new_value: "3960000" });
  });

  it("blocks (circuit breaker) an oversized credit-cap move instead of applying it", async () => {
    // implied monthly cost/user = $1.50 -> desired cap = 3x = $4.50, a 25% jump from $3.60 -- exceeds the 15% bound.
    const tiers: TierRow[] = [{ id: "starter", monthly_price_usd_cents: 1500, monthly_credit_cap_usd_micros: 3_600_000 }];
    const stats: StatsRow[] = [{ tier_id: "starter", active_users: 20, total_cost_usd_micros: 1_000_000 }];
    const { supabase, updateCalls, insertCalls } = fakeAdminSupabase({ tiers, stats });

    const outcomes = await runMarginTuningPass(supabase, new Date("2026-08-20T00:00:00Z"));

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ tierId: "starter", status: "blocked", field: "credit_cap", oldValue: "3600000", newValue: "3600000" });
    expect(updateCalls).toHaveLength(0); // never actually mutates the tier row
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].payload).toMatchObject({ status: "blocked", old_value: "3600000", new_value: "3600000" });
  });

  it("proposes (never auto-applies) a model-allowlist review when typical margin drops below target minus tolerance", async () => {
    // implied monthly cost/user = $2.00 -> margin = (15-2)/15 = 86.7%, below Starter's 92% target minus 5pt tolerance (87%).
    // Cap is seeded already at the resulting 3x ($6.00) so the cap lever has nothing to do here -- isolates the allowlist signal.
    const tiers: TierRow[] = [{ id: "starter", monthly_price_usd_cents: 1500, monthly_credit_cap_usd_micros: 6_000_000 }];
    const stats: StatsRow[] = [{ tier_id: "starter", active_users: 20, total_cost_usd_micros: 1_333_333 }];
    const { supabase, updateCalls, insertCalls } = fakeAdminSupabase({ tiers, stats });

    const outcomes = await runMarginTuningPass(supabase, new Date("2026-08-20T00:00:00Z"));

    expect(updateCalls).toHaveLength(0);
    const proposal = outcomes.find((o) => o.field === "model_allowlist");
    expect(proposal).toMatchObject({ tierId: "starter", status: "proposed", field: "model_allowlist", oldValue: null, newValue: null });

    const logRow = insertCalls.find((c) => (c.payload as Record<string, unknown>).field === "model_allowlist");
    expect(logRow?.payload).toMatchObject({ tier_id: "starter", status: "proposed", old_value: null, new_value: null });
    // Never applied mid-cycle -- effective_at is deferred to the start of next calendar month.
    expect(logRow?.payload.effective_at).toBe("2026-09-01T00:00:00.000Z");
  });

  it("skips a tier id with no known target margin/multiplier -- no crash, no DB writes", async () => {
    const tiers: TierRow[] = [{ id: "unknown-tier", monthly_price_usd_cents: 1000, monthly_credit_cap_usd_micros: 1_000_000 }];
    const stats: StatsRow[] = [{ tier_id: "unknown-tier", active_users: 50, total_cost_usd_micros: 500_000 }];
    const { supabase, updateCalls, insertCalls } = fakeAdminSupabase({ tiers, stats });

    const outcomes = await runMarginTuningPass(supabase, new Date("2026-08-20T00:00:00Z"));

    expect(outcomes).toEqual([]);
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("returns an empty result (never throws) when the tiers fetch errors", async () => {
    const { supabase } = fakeAdminSupabase({ tiers: [], stats: [] });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: new Error("db down") }) }),
    }));

    await expect(runMarginTuningPass(supabase, new Date())).resolves.toEqual([]);
  });

  it("returns an empty result (never throws) when the tier_margin_daily_stats RPC errors", async () => {
    const tiers: TierRow[] = [{ id: "starter", monthly_price_usd_cents: 1500, monthly_credit_cap_usd_micros: 3_600_000 }];
    const { supabase } = fakeAdminSupabase({ tiers, stats: [], statsError: new Error("rpc failed") });

    await expect(runMarginTuningPass(supabase, new Date())).resolves.toEqual([]);
  });
});
