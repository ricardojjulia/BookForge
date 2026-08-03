import { describe, expect, it } from "vitest";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";

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
});
