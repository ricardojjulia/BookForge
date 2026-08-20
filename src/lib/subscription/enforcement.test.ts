import { afterEach, describe, expect, it, vi } from "vitest";
import { assertModelAllowedForUser, getUserSubscriptionTier, TierModelNotAllowedError } from "@/lib/subscription/enforcement";

function fakeSupabase(rpcResult: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return { rpc } as unknown as Parameters<typeof assertModelAllowedForUser>[0];
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
