import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertModelAllowedForUser,
  getUserSubscriptionTier,
  InsufficientCreditsError,
  reconcileCreditReservation,
  reserveCreditsForCall,
  TierModelNotAllowedError,
} from "@/lib/subscription/enforcement";

function fakeSupabase(rpcResult: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return { rpc } as unknown as Parameters<typeof assertModelAllowedForUser>[0];
}

/** Mocks the `.from("model_pricing").select().eq().is().maybeSingle()` chain used by getCurrentModelPricing, plus `.rpc()` for reserve_ai_credits. */
function fakeSupabaseForReservation(input: { pricingRow?: unknown; rpcResult: { data?: unknown; error?: unknown } }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: input.pricingRow ?? null, error: null });
  const chain = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  const from = vi.fn().mockReturnValue(chain);
  const rpc = vi.fn().mockResolvedValue(input.rpcResult);
  return { from, rpc } as unknown as Parameters<typeof reserveCreditsForCall>[0];
}

describe("assertModelAllowedForUser", () => {
  const originalMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;

  afterEach(() => {
    if (originalMode === undefined) delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    else process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = originalMode;
  });

  it("is a no-op on self-hosted (default) -- never even queries", async () => {
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    const supabase = fakeSupabase({ data: false });

    await expect(
      assertModelAllowedForUser(supabase, { userId: "user-1", model: "anthropic/claude-opus-5", task: "rewrite" }),
    ).resolves.toBeUndefined();
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("allows the call in managed_saas mode when the RPC returns true", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    const supabase = fakeSupabase({ data: true });

    await expect(
      assertModelAllowedForUser(supabase, { userId: "user-1", model: "deepseek/deepseek-v4-pro", task: "rewrite" }),
    ).resolves.toBeUndefined();
  });

  it("fails closed (throws) in managed_saas mode when the RPC returns false", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    const supabase = fakeSupabase({ data: false });

    await expect(
      assertModelAllowedForUser(supabase, { userId: "user-1", model: "anthropic/claude-opus-5", task: "extraction" }),
    ).rejects.toThrow(TierModelNotAllowedError);
  });

  it("fails closed (throws, does not silently allow) when the RPC itself errors", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    const supabase = fakeSupabase({ data: undefined, error: new Error("connection reset") });

    await expect(
      assertModelAllowedForUser(supabase, { userId: "user-1", model: "deepseek/deepseek-v4-pro", task: "rewrite" }),
    ).rejects.toThrow(TierModelNotAllowedError);
  });
});

describe("getUserSubscriptionTier", () => {
  const originalMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;

  afterEach(() => {
    if (originalMode === undefined) delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    else process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = originalMode;
  });

  it("returns null on self-hosted -- never even queries", async () => {
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    const supabase = fakeSupabase({ data: "pro" });

    await expect(getUserSubscriptionTier(supabase, "user-1")).resolves.toBeNull();
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("returns the tier in managed_saas mode", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    const supabase = fakeSupabase({ data: "studio" });

    await expect(getUserSubscriptionTier(supabase, "user-1")).resolves.toBe("studio");
  });

  it("returns null (never throws) on a query error -- this is telemetry, not a gate", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    const supabase = fakeSupabase({ data: undefined, error: new Error("connection reset") });

    await expect(getUserSubscriptionTier(supabase, "user-1")).resolves.toBeNull();
  });
});

describe("reserveCreditsForCall", () => {
  const originalMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
  const baseInput = { userId: "user-1", model: "deepseek/deepseek-v4-pro", task: "rewrite", promptTokensEstimate: 1000, maxOutputTokens: 500 };

  afterEach(() => {
    if (originalMode === undefined) delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    else process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = originalMode;
  });

  it("is a no-op on self-hosted -- never even queries pricing or the reservation RPC", async () => {
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    const supabase = fakeSupabaseForReservation({ rpcResult: { data: [{ reservation_id: "res-1" }] } });

    await expect(reserveCreditsForCall(supabase, baseInput)).resolves.toBeNull();
    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("fails closed (throws, never calls the reservation RPC) when the model has no pricing row", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    const supabase = fakeSupabaseForReservation({ pricingRow: null, rpcResult: { data: [{ reservation_id: "res-1" }] } });

    await expect(reserveCreditsForCall(supabase, baseInput)).rejects.toThrow(InsufficientCreditsError);
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("returns the reservationId in managed_saas mode when pricing exists and the RPC succeeds", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    const supabase = fakeSupabaseForReservation({
      pricingRow: { input_usd_micros_per_million_tokens: 507, output_usd_micros_per_million_tokens: 1014 },
      rpcResult: { data: [{ reservation_id: "res-42" }] },
    });

    await expect(reserveCreditsForCall(supabase, baseInput)).resolves.toEqual({ reservationId: "res-42" });
  });

  it("fails closed (throws InsufficientCreditsError) when the reservation RPC returns no row (balance too low)", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    const supabase = fakeSupabaseForReservation({
      pricingRow: { input_usd_micros_per_million_tokens: 507, output_usd_micros_per_million_tokens: 1014 },
      rpcResult: { data: [], error: null },
    });

    await expect(reserveCreditsForCall(supabase, baseInput)).rejects.toThrow(InsufficientCreditsError);
  });

  it("fails closed (throws) when the reservation RPC itself errors", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    const supabase = fakeSupabaseForReservation({
      pricingRow: { input_usd_micros_per_million_tokens: 507, output_usd_micros_per_million_tokens: 1014 },
      rpcResult: { data: null, error: new Error("db error") },
    });

    await expect(reserveCreditsForCall(supabase, baseInput)).rejects.toThrow(InsufficientCreditsError);
  });
});

describe("reconcileCreditReservation", () => {
  const originalMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;

  afterEach(() => {
    if (originalMode === undefined) delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    else process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = originalMode;
  });

  it("is a no-op on self-hosted -- never even queries", async () => {
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    const supabase = fakeSupabase({ data: null });

    await expect(
      reconcileCreditReservation(supabase, { reservationId: "res-1", actualCostUsdMicros: 100 }),
    ).resolves.toBeUndefined();
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("calls reconcile_ai_credit_reservation with the actual cost in managed_saas mode", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    const supabase = fakeSupabase({ data: null });

    await reconcileCreditReservation(supabase, { reservationId: "res-1", actualCostUsdMicros: 250, modelCallEventId: "evt-1" });

    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("reconcile_ai_credit_reservation", {
      p_reservation_id: "res-1",
      p_actual_amount_usd_micros: 250,
      p_model_call_event_id: "evt-1",
    });
  });

  it("never throws (best-effort true-up) even when the RPC call itself rejects", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "managed_saas";
    const rpc = vi.fn().mockRejectedValue(new Error("connection reset"));
    const supabase = { rpc } as unknown as Parameters<typeof reconcileCreditReservation>[0];

    await expect(
      reconcileCreditReservation(supabase, { reservationId: "res-1", actualCostUsdMicros: 100 }),
    ).resolves.toBeUndefined();
  });
});
