import { afterEach, describe, expect, it, vi } from "vitest";
import { computeOpenRouterKeyLimitUsd, isOpenRouterKeyLimitExceededError, resolveOpenRouterManagementKey } from "@/lib/openrouter/management";

describe("computeOpenRouterKeyLimitUsd", () => {
  it("applies the 20% goodwill bonus to each tier's cap", () => {
    expect(computeOpenRouterKeyLimitUsd(3_600_000)).toBe(4.32); // Starter $3.60 -> $4.32
    expect(computeOpenRouterKeyLimitUsd(18_000_000)).toBe(21.6); // Pro $18 -> $21.60
    expect(computeOpenRouterKeyLimitUsd(48_000_000)).toBe(57.6); // Studio $48 -> $57.60
    expect(computeOpenRouterKeyLimitUsd(180_000_000)).toBe(216); // Publisher $180 -> $216.00
  });

  it("rounds to the nearest cent", () => {
    expect(computeOpenRouterKeyLimitUsd(1_000_000)).toBe(1.2);
    expect(computeOpenRouterKeyLimitUsd(1_111_111)).toBe(1.33); // 1.3333332 -> 1.33
  });

  it("returns 0 for a zero cap", () => {
    expect(computeOpenRouterKeyLimitUsd(0)).toBe(0);
  });
});

describe("isOpenRouterKeyLimitExceededError", () => {
  it("returns false for a non-Error value", () => {
    expect(isOpenRouterKeyLimitExceededError("nope")).toBe(false);
    expect(isOpenRouterKeyLimitExceededError(null)).toBe(false);
  });

  it("returns false for an unrelated error", () => {
    expect(isOpenRouterKeyLimitExceededError(new Error("network timeout"))).toBe(false);
  });

  it("returns true for a 402 mentioning a limit", () => {
    expect(isOpenRouterKeyLimitExceededError(new Error("OpenRouter key management request failed (402): key limit exceeded"))).toBe(true);
  });
});

function fakeSupabase(config: { fundingModel?: string | null; rpcResult?: { data?: unknown; error?: unknown } }) {
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: config.fundingModel !== undefined ? { openrouter_scoped_key_funding_model: config.fundingModel } : null,
          error: null,
        }),
      }),
    }),
  });
  const rpc = vi.fn().mockResolvedValue(config.rpcResult ?? { data: null, error: null });
  return { from, rpc } as unknown as Parameters<typeof resolveOpenRouterManagementKey>[0];
}

describe("resolveOpenRouterManagementKey", () => {
  const originalMasterKey = process.env.OPENROUTER_MASTER_MANAGEMENT_KEY;

  afterEach(() => {
    if (originalMasterKey === undefined) delete process.env.OPENROUTER_MASTER_MANAGEMENT_KEY;
    else process.env.OPENROUTER_MASTER_MANAGEMENT_KEY = originalMasterKey;
  });

  it("reads the env master key for a bookforge_managed user", async () => {
    process.env.OPENROUTER_MASTER_MANAGEMENT_KEY = "sk-master-123";
    const supabase = fakeSupabase({ fundingModel: "bookforge_managed" });
    await expect(resolveOpenRouterManagementKey(supabase, "user-1")).resolves.toBe("sk-master-123");
  });

  it("throws when bookforge_managed but the env var is unset", async () => {
    delete process.env.OPENROUTER_MASTER_MANAGEMENT_KEY;
    const supabase = fakeSupabase({ fundingModel: "bookforge_managed" });
    await expect(resolveOpenRouterManagementKey(supabase, "user-1")).rejects.toThrow(/OPENROUTER_MASTER_MANAGEMENT_KEY/);
  });

  it("calls the per-user RPC for a self_funded user", async () => {
    const supabase = fakeSupabase({ fundingModel: "self_funded", rpcResult: { data: "sk-user-own-key", error: null } });
    await expect(resolveOpenRouterManagementKey(supabase, "user-1")).resolves.toBe("sk-user-own-key");
    expect(supabase.rpc).toHaveBeenCalledWith("get_openrouter_management_key", { p_user_id: "user-1" });
  });

  it("throws when the self_funded RPC returns nothing", async () => {
    const supabase = fakeSupabase({ fundingModel: "self_funded", rpcResult: { data: null, error: null } });
    await expect(resolveOpenRouterManagementKey(supabase, "user-1")).rejects.toThrow(/No OpenRouter management key on file/);
  });

  it("defaults to the self_funded RPC path when no user_settings row exists yet", async () => {
    const supabase = fakeSupabase({ rpcResult: { data: "sk-user-own-key", error: null } });
    await expect(resolveOpenRouterManagementKey(supabase, "user-1")).resolves.toBe("sk-user-own-key");
  });
});
