import { describe, expect, it } from "vitest";
import { AiEngineNotConfiguredError, getLmStudioErrorMessage } from "@/lib/lmstudio/errors";

describe("getLmStudioErrorMessage", () => {
  it("blames the actual cloud provider for a connection failure instead of LM Studio", () => {
    const message = getLmStudioErrorMessage(new Error("fetch failed"), "fallback", { modelSource: "openrouter" });
    expect(message).toContain("OpenRouter");
    expect(message).not.toContain("LM Studio");
  });

  it("still blames LM Studio when no cloud provider is configured", () => {
    const message = getLmStudioErrorMessage(new Error("fetch failed"), "fallback", {});
    expect(message).toContain("LM Studio");
  });

  it("surfaces a clear reconnect message for a provider 401, naming the provider when known", () => {
    const message = getLmStudioErrorMessage(new Error("401 User not found."), "fallback", { modelSource: "openrouter" });
    expect(message).toContain("OpenRouter");
    expect(message).toContain("Reconnect your AI engine in Settings");
    expect(message).not.toContain("User not found");
  });

  it("still gives an actionable 401 message when the provider is unknown", () => {
    const message = getLmStudioErrorMessage(new Error("401 Unauthorized"), "fallback", {});
    expect(message).toContain("Reconnect your AI engine in Settings");
  });

  it("passes through an AiEngineNotConfiguredError's own message unchanged", () => {
    const message = getLmStudioErrorMessage(new AiEngineNotConfiguredError(), "fallback");
    expect(message).toContain("Connect an AI engine in Settings");
  });
});
