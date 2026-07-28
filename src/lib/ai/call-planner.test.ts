import { describe, expect, it } from "vitest";
import { estimateAiCallPlan } from "@/lib/ai/call-planner";

describe("estimateAiCallPlan", () => {
  it("uses summary strategy for critic task and emits deterministic math/warnings", () => {
    const plan = estimateAiCallPlan({
      task: "critic",
      selectedModel: "qwen3-32b-instruct-q4_k_m",
      qualityProfile: "balanced",
      contextWindowTokens: 32768,
      maxOutputTokens: 2048,
      chapterCount: 12,
      sceneCount: 48,
      paragraphCount: 1200,
    });

    expect(plan.unitStrategy).toBe("summaries");
    expect(plan.modelSizeB).toBe(32);
    expect(plan.quantization?.toLowerCase()).toContain("q4");
    expect(plan.expectedCalls).toBeGreaterThan(0);
    expect(plan.math).toContain("estimatedInputTokens");
    expect(plan.warnings.some((w) => w.includes("Large local model"))).toBe(true);
  });

  it("prefers smaller unit strategy when usable context per call is tight", () => {
    const plan = estimateAiCallPlan({
      task: "revision",
      selectedModel: "tiny-7b-q3_k_m",
      qualityProfile: "premium",
      contextWindowTokens: 4096,
      maxOutputTokens: 2048,
      chapterCount: 10,
      sceneCount: 15,
      paragraphCount: 1400,
    });

    expect(plan.unitStrategy).toBe("paragraphs");
    expect(plan.targetTokensPerCall).toBeGreaterThanOrEqual(700);
    expect(plan.expectedCalls).toBeGreaterThan(1);
    expect(plan.warnings.some((w) => w.includes("Low quantization"))).toBe(true);
  });

  it("increases expected calls as manuscript size increases", () => {
    const small = estimateAiCallPlan({
      task: "revision",
      selectedModel: "qwen3-14b-instruct-q4",
      qualityProfile: "balanced",
      contextWindowTokens: 16384,
      maxOutputTokens: 1500,
      chapterCount: 4,
      sceneCount: 12,
      paragraphCount: 200,
    });

    const large = estimateAiCallPlan({
      task: "revision",
      selectedModel: "qwen3-14b-instruct-q4",
      qualityProfile: "balanced",
      contextWindowTokens: 16384,
      maxOutputTokens: 1500,
      chapterCount: 12,
      sceneCount: 36,
      paragraphCount: 1200,
    });

    expect(large.expectedCalls).toBeGreaterThan(small.expectedCalls);
    expect(large.estimatedTotalSeconds).toBeGreaterThan(small.estimatedTotalSeconds);
  });
});
