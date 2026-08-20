import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LmStudioSettings } from "@/lib/types";

const { createProviderClientMock, assertModelAllowedForUserMock } = vi.hoisted(() => ({
  createProviderClientMock: vi.fn(),
  assertModelAllowedForUserMock: vi.fn(),
}));

vi.mock("@/lib/ai/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/providers")>()),
  createProviderClient: createProviderClientMock,
}));
vi.mock("@/lib/subscription/enforcement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/subscription/enforcement")>()),
  assertModelAllowedForUser: assertModelAllowedForUserMock,
}));

import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";

function cloudSettings(): LmStudioSettings {
  return {
    baseUrl: "http://localhost:1234/v1",
    qualityProfile: "balanced",
    contextWindowTokens: 32768,
    temperature: 0.7,
    topP: 0.9,
    repeatPenalty: 1.05,
    maxOutputTokens: 4096,
    executionMode: "cloud",
    standardSettings: {
      provider: "openrouter",
      apiKey: "test-key",
      model: "anthropic/claude-opus-5",
    },
  };
}

describe("selectAndPrepareActiveModel -- fail-closed tier gate (cloud path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProviderClientMock.mockReturnValue({ client: "fake-openai-client" });
  });
  afterEach(() => vi.clearAllMocks());

  it("rejects the call before ever constructing a provider client", async () => {
    assertModelAllowedForUserMock.mockRejectedValue(new Error("Model not allowed on this plan."));

    await expect(
      selectAndPrepareActiveModel(cloudSettings(), {
        task: "rewrite",
        candidates: [],
        telemetry: { supabase: {} as never, userId: "user-1" },
      }),
    ).rejects.toThrow("Model not allowed on this plan.");

    expect(assertModelAllowedForUserMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "user-1", model: "anthropic/claude-opus-5", task: "rewrite" }),
    );
    // The whole point: a bug that gates AFTER calling the provider would still
    // pass a status-code-only assertion. Assert the provider was never touched.
    expect(createProviderClientMock).not.toHaveBeenCalled();
  });

  it("proceeds to construct the provider client once the gate allows it", async () => {
    assertModelAllowedForUserMock.mockResolvedValue(undefined);

    const plan = await selectAndPrepareActiveModel(cloudSettings(), {
      task: "rewrite",
      candidates: [],
      telemetry: { supabase: {} as never, userId: "user-1" },
    });

    expect(createProviderClientMock).toHaveBeenCalledTimes(1);
    expect(plan.model).toBe("anthropic/claude-opus-5");
  });
});
