import { beforeEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { createManagedChatCompletion, type PreparedLmStudioModel } from "@/lib/lmstudio/client";
import { InsufficientCreditsError } from "@/lib/subscription/enforcement";

vi.mock("@/lib/subscription/enforcement", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/subscription/enforcement")>();
  return {
    ...actual,
    reserveCreditsForCall: vi.fn().mockResolvedValue({ reservationId: "res-1" }),
    reconcileCreditReservation: vi.fn().mockResolvedValue(undefined),
    getUserSubscriptionTier: vi.fn().mockResolvedValue("pro"),
  };
});
vi.mock("@/lib/subscription/pricing", () => ({
  getCurrentModelPricing: vi.fn().mockResolvedValue(null),
  computeCostUsdMicros: vi.fn().mockReturnValue(0),
}));
vi.mock("@/lib/ai/model-performance", () => ({
  recordModelCallEvent: vi.fn().mockResolvedValue("event-1"),
  classifyLmStudioError: vi.fn().mockReturnValue({ outcome: "error", signature: "test" }),
  capContextUsingHealth: vi.fn((limits) => limits),
}));
vi.mock("@/lib/openrouter/management", () => ({
  isOpenRouterKeyLimitExceededError: vi.fn().mockReturnValue(false),
}));

import { reserveCreditsForCall } from "@/lib/subscription/enforcement";

function fakePrepared(overrides: Partial<PreparedLmStudioModel> = {}): PreparedLmStudioModel {
  return {
    model: "deepseek/deepseek-v4-pro",
    runtimeLimits: {
      configuredContextTokens: 32768,
      maxOutputTokens: 4096,
      reservedTokens: 0,
      usableInputTokens: 30000,
      promptCharBudget: 100000,
      warnings: [],
    },
    loadedContextTokens: null,
    warnings: [],
    nativeModelManagementAvailable: false,
    isCloud: true,
    ...overrides,
  };
}

function fakeOpenAiClient(): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          id: "cmpl-1",
          model: "deepseek/deepseek-v4-pro",
          choices: [{ message: { content: "hello" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      },
    },
  } as unknown as OpenAI;
}

function fakeTelemetryContext() {
  return {
    supabase: {} as never,
    userId: "user-1",
    task: "rewrite",
    model: "deepseek/deepseek-v4-pro",
  };
}

describe("createManagedChatCompletion -- credit reservation gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reserves credits for a regular cloud call", async () => {
    const client = fakeOpenAiClient();
    await createManagedChatCompletion(client, fakePrepared(), { messages: [{ role: "user", content: "hi" }] }, undefined, fakeTelemetryContext());
    expect(reserveCreditsForCall).toHaveBeenCalled();
  });

  it("also reserves credits for a BookForge-managed OpenRouter scoped key", async () => {
    // Live-verified 2026-08-29: OpenRouter's own key `limit` lags real spend
    // by several seconds and doesn't block a burst of over-limit calls, so
    // it can't be the sole enforcer -- the internal ledger reservation must
    // run for managed keys too, not just self_funded.
    const client = fakeOpenAiClient();
    await createManagedChatCompletion(
      client,
      fakePrepared({ isManagedOpenRouterKey: true }),
      { messages: [{ role: "user", content: "hi" }] },
      undefined,
      fakeTelemetryContext(),
    );
    expect(reserveCreditsForCall).toHaveBeenCalled();
  });
});

describe("createManagedChatCompletion -- OpenRouter key-limit-exceeded mapping", () => {
  it("maps a managed key's limit-exceeded failure into InsufficientCreditsError", async () => {
    const { isOpenRouterKeyLimitExceededError } = await import("@/lib/openrouter/management");
    vi.mocked(isOpenRouterKeyLimitExceededError).mockReturnValue(true);

    const client = {
      chat: { completions: { create: vi.fn().mockRejectedValue(new Error("402: key limit exceeded")) } },
    } as unknown as OpenAI;

    await expect(
      createManagedChatCompletion(
        client,
        fakePrepared({ isManagedOpenRouterKey: true }),
        { messages: [{ role: "user", content: "hi" }] },
        undefined,
        fakeTelemetryContext(),
      ),
    ).rejects.toThrow(InsufficientCreditsError);

    vi.mocked(isOpenRouterKeyLimitExceededError).mockReturnValue(false);
  });
});
