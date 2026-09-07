import { beforeEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { createManagedChatCompletion, type PreparedLmStudioModel } from "@/lib/lmstudio/client";
import { InsufficientCreditsError } from "@/lib/subscription/enforcement";

// Next's real after() only works inside a live request context (Route
// Handler/Server Action/Middleware), which this test harness doesn't
// provide -- it throws synchronously otherwise. Production relies on the
// real after() to survive the calling route's response being sent before
// this background work (telemetry + credit-reservation true-up) finishes;
// for tests, just invoke the callback immediately.
const afterMock = vi.fn((callback: () => unknown) => {
  void callback();
});
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => afterMock(callback),
}));

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

  it("defers telemetry recording via after(), not a bare fire-and-forget call", async () => {
    // Regression guard: a fire-and-forget `void recordCompletionOutcome(...)`
    // (or the failure-path recordModelCallEvent) can be silently killed by
    // Vercel tearing down the function right after the response is sent --
    // this codebase has already been burned by that exact pattern twice
    // elsewhere (rewrite-execute/generate-draft's self-chaining). after()
    // is what actually survives past the response; asserting it was called
    // is what would have caught a regression back to a bare void call.
    const client = fakeOpenAiClient();
    await createManagedChatCompletion(client, fakePrepared(), { messages: [{ role: "user", content: "hi" }] }, undefined, fakeTelemetryContext());
    expect(afterMock).toHaveBeenCalledTimes(1);

    const { recordModelCallEvent } = await import("@/lib/ai/model-performance");
    expect(recordModelCallEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "user-1", model: "deepseek/deepseek-v4-pro" }));
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
