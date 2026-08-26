import { describe, expect, it } from "vitest";
import { computeOpenRouterKeyLimitUsd, isOpenRouterKeyLimitExceededError } from "@/lib/openrouter/management";

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
