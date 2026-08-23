import { describe, expect, it } from "vitest";
import {
  CLOUD_MODEL_CATALOG,
  getCloudModelsForProvider,
  matchLocalModelFamily,
  resolveManagedSaasTaskModelDefaults,
  type ModelPrice,
} from "@/lib/ai/model-catalog";

describe("model-catalog", () => {
  it("exposes current Anthropic model IDs, not retired ones", () => {
    const anthropicIds = getCloudModelsForProvider("anthropic").map((m) => m.id);
    expect(anthropicIds).toEqual(["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5"]);
    expect(anthropicIds.some((id) => id.includes("4-6") || id.includes("4-7"))).toBe(false);
  });

  it("every catalog entry has a unique id per provider", () => {
    const seen = new Set<string>();
    for (const entry of CLOUD_MODEL_CATALOG) {
      const key = `${entry.provider}:${entry.id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("matches the most specific local model family, not the generic parent", () => {
    expect(matchLocalModelFamily("qwen2.5-coder-32b-instruct")?.id).toBe("qwen-coder");
    expect(matchLocalModelFamily("qwen3-32b-instruct-q4_k_m")?.id).toBe("qwen");
    expect(matchLocalModelFamily("deepseek-r1-distill-qwen-32b")?.id).toBe("deepseek-r1");
    expect(matchLocalModelFamily("deepseek-v3-chat")?.id).toBe("deepseek");
  });

  it("classifies embedding and reranker families correctly", () => {
    expect(matchLocalModelFamily("bge-m3")?.kind).toBe("embedding");
    expect(matchLocalModelFamily("bge-reranker-v2-m3")?.kind).toBe("reranker");
    expect(matchLocalModelFamily("nomic-embed-text-v1.5")?.kind).toBe("embedding");
  });

  it("returns null for unrecognized model names", () => {
    expect(matchLocalModelFamily("totally-unknown-custom-model")).toBeNull();
  });

  describe("resolveManagedSaasTaskModelDefaults", () => {
    const allBothAllowed = new Set(["google/gemini-2.5-flash", "deepseek/deepseek-v4-pro", "anthropic/claude-haiku-4.5"]);

    it("without pricing, falls back to the static quality-preference order", () => {
      const result = resolveManagedSaasTaskModelDefaults(allBothAllowed);
      expect(result.critic).toBe("google/gemini-2.5-flash");
      expect(result.rewrite).toBe("deepseek/deepseek-v4-pro");
    });

    it("with pricing, picks whichever allowed candidate is currently cheapest", () => {
      // Gemini normally comes first for critic, but if DeepSeek is currently
      // priced lower, the live-priced pick should switch to it.
      const pricing = new Map<string, ModelPrice>([
        ["google/gemini-2.5-flash", { inputUsdMicrosPerMillion: 300_000, outputUsdMicrosPerMillion: 2_500_000 }],
        ["deepseek/deepseek-v4-pro", { inputUsdMicrosPerMillion: 100_000, outputUsdMicrosPerMillion: 200_000 }],
      ]);
      const result = resolveManagedSaasTaskModelDefaults(allBothAllowed, pricing);
      expect(result.critic).toBe("deepseek/deepseek-v4-pro");
    });

    it("never picks a candidate the tier doesn't allow, even if it would be cheaper", () => {
      const starterOnly = new Set(["deepseek/deepseek-v4-pro"]);
      const pricing = new Map<string, ModelPrice>([
        ["google/gemini-2.5-flash", { inputUsdMicrosPerMillion: 1, outputUsdMicrosPerMillion: 1 }],
        ["deepseek/deepseek-v4-pro", { inputUsdMicrosPerMillion: 999_999, outputUsdMicrosPerMillion: 999_999 }],
      ]);
      const result = resolveManagedSaasTaskModelDefaults(starterOnly, pricing);
      expect(result.critic).toBe("deepseek/deepseek-v4-pro");
    });

    it("falls back to list order when none of the allowed candidates have a live price on record", () => {
      const pricing = new Map<string, ModelPrice>([["anthropic/claude-opus-5", { inputUsdMicrosPerMillion: 1, outputUsdMicrosPerMillion: 1 }]]);
      const result = resolveManagedSaasTaskModelDefaults(allBothAllowed, pricing);
      expect(result.critic).toBe("google/gemini-2.5-flash");
    });

    it("always falls back to deepseek-v4-pro when nothing in the priority list is allowed", () => {
      const result = resolveManagedSaasTaskModelDefaults(new Set());
      expect(result.critic).toBe("deepseek/deepseek-v4-pro");
      expect(result.planning).toBe("deepseek/deepseek-v4-pro");
    });
  });
});
