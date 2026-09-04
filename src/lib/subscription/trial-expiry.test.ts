import { beforeEach, describe, expect, it, vi } from "vitest";
import { expireLapsedTrialManagedKeys } from "@/lib/subscription/trial-expiry";

const disableManagedOpenRouterKey = vi.fn();
vi.mock("@/lib/openrouter/management", () => ({
  disableManagedOpenRouterKey: (...args: unknown[]) => disableManagedOpenRouterKey(...args),
}));

const NOW = new Date("2026-09-18T00:00:00.000Z");

function buildSupabase({
  lapsedTrials,
  managedKeyRows,
}: {
  lapsedTrials: { user_id: string }[];
  managedKeyRows: { user_id: string; openrouter_scoped_key_hash: string }[];
}) {
  const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const updateIn = vi.fn(() => ({ eq: updateEq }));
  const update = vi.fn(() => ({ in: updateIn }));

  const settingsNot = vi.fn().mockResolvedValue({ data: managedKeyRows, error: null });
  const settingsEq = vi.fn(() => ({ not: settingsNot }));
  const settingsIn = vi.fn(() => ({ eq: settingsEq }));
  const settingsSelect = vi.fn(() => ({ in: settingsIn }));

  const trialsLte = vi.fn().mockResolvedValue({ data: lapsedTrials, error: null });
  const trialsEq = vi.fn(() => ({ lte: trialsLte }));
  const trialsSelect = vi.fn(() => ({ eq: trialsEq }));

  const from = vi.fn((table: string) => {
    if (table === "user_subscriptions") return { select: trialsSelect, update };
    if (table === "user_settings") return { select: settingsSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from, update, updateIn, updateEq, settingsIn, trialsEq, trialsLte };
}

describe("expireLapsedTrialManagedKeys", () => {
  beforeEach(() => {
    disableManagedOpenRouterKey.mockReset();
    delete process.env.OPENROUTER_MASTER_MANAGEMENT_KEY;
  });

  it("reports zero when no trial has lapsed", async () => {
    const supabase = buildSupabase({ lapsedTrials: [], managedKeyRows: [] });

    await expect(expireLapsedTrialManagedKeys(supabase as never, NOW)).resolves.toEqual({ expired: 0, keysDisabled: 0 });
    expect(disableManagedOpenRouterKey).not.toHaveBeenCalled();
  });

  it("disables each lapsed trial's managed key and cancels the subscription", async () => {
    process.env.OPENROUTER_MASTER_MANAGEMENT_KEY = "master-key";
    disableManagedOpenRouterKey.mockResolvedValue(undefined);
    const supabase = buildSupabase({
      lapsedTrials: [{ user_id: "user-1" }, { user_id: "user-2" }],
      managedKeyRows: [{ user_id: "user-1", openrouter_scoped_key_hash: "hash-1" }],
    });

    await expect(expireLapsedTrialManagedKeys(supabase as never, NOW)).resolves.toEqual({ expired: 2, keysDisabled: 1 });

    expect(disableManagedOpenRouterKey).toHaveBeenCalledTimes(1);
    expect(disableManagedOpenRouterKey).toHaveBeenCalledWith("master-key", "hash-1");
    expect(supabase.update).toHaveBeenCalledWith({ status: "canceled", updated_at: NOW.toISOString() });
    expect(supabase.updateIn).toHaveBeenCalledWith("user_id", ["user-1", "user-2"]);
    expect(supabase.updateEq).toHaveBeenCalledWith("status", "trialing");
  });

  it("still cancels lapsed trials that never had a managed key, without requiring the master key", async () => {
    const supabase = buildSupabase({
      lapsedTrials: [{ user_id: "user-1" }],
      managedKeyRows: [],
    });

    await expect(expireLapsedTrialManagedKeys(supabase as never, NOW)).resolves.toEqual({ expired: 1, keysDisabled: 0 });
    expect(disableManagedOpenRouterKey).not.toHaveBeenCalled();
  });

  it("throws if a managed key needs disabling but the master key isn't configured", async () => {
    const supabase = buildSupabase({
      lapsedTrials: [{ user_id: "user-1" }],
      managedKeyRows: [{ user_id: "user-1", openrouter_scoped_key_hash: "hash-1" }],
    });

    await expect(expireLapsedTrialManagedKeys(supabase as never, NOW)).rejects.toThrow("OPENROUTER_MASTER_MANAGEMENT_KEY");
    expect(disableManagedOpenRouterKey).not.toHaveBeenCalled();
  });

  it("logs and continues past a single key-disable failure instead of aborting the batch", async () => {
    process.env.OPENROUTER_MASTER_MANAGEMENT_KEY = "master-key";
    disableManagedOpenRouterKey.mockRejectedValueOnce(new Error("OpenRouter API down")).mockResolvedValueOnce(undefined);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = buildSupabase({
      lapsedTrials: [{ user_id: "user-1" }, { user_id: "user-2" }],
      managedKeyRows: [
        { user_id: "user-1", openrouter_scoped_key_hash: "hash-1" },
        { user_id: "user-2", openrouter_scoped_key_hash: "hash-2" },
      ],
    });

    await expect(expireLapsedTrialManagedKeys(supabase as never, NOW)).resolves.toEqual({ expired: 2, keysDisabled: 1 });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("propagates a database error from the initial trial lookup", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ lte: vi.fn().mockResolvedValue({ data: null, error: new Error("db down") }) })) })),
      })),
    };

    await expect(expireLapsedTrialManagedKeys(supabase as never, NOW)).rejects.toThrow("db down");
  });
});
