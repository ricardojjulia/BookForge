import { describe, expect, it } from "vitest";
import {
  CLOUD_MODEL_CATALOG,
  getCloudModelsForProvider,
  matchLocalModelFamily,
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
});
