import { describe, expect, it } from "vitest";
import { applyRewritePlanDefaults } from "@/lib/rewrite/plan-defaults";

describe("applyRewritePlanDefaults", () => {
  it("unwraps embedded JSON rewriteObjective plan and preserves sibling metadata", () => {
    const result = applyRewritePlanDefaults({
      rewriteObjective: `\`\`\`json\n{\n  "rewriteObjective": "Keep voice",\n  "contextContinuityMandate": "Never drift",\n  "globalGuardrails": ["Rule A"]\n}\n\`\`\``,
      aiCallPlan: { expectedCalls: 42 },
    });

    expect(result.rewriteObjective).toBe("Keep voice");
    expect(result.contextContinuityMandate).toBe("Never drift");
    expect(result.globalGuardrails).toEqual(["Rule A"]);
    expect(result.aiCallPlan).toEqual({ expectedCalls: 42 });
  });

  it("salvages key fields from malformed embedded JSON text", () => {
    const malformed = `{
      "rewriteObjective": "Preserve meaning",
      "contextContinuityMandate": "Keep timeline stable",
      "globalGuardrails": [
    `;

    const result = applyRewritePlanDefaults({ rewriteObjective: malformed });

    expect(result.rewriteObjective).toBe("Preserve meaning");
    expect(result.contextContinuityMandate).toBe("Keep timeline stable");
    expect(Array.isArray(result.globalGuardrails)).toBe(true);
    expect((result.globalGuardrails as unknown[]).length).toBeGreaterThan(0);
  });

  it("builds chapter directive fallbacks from chapter context", () => {
    const result = applyRewritePlanDefaults(
      {
        rewriteObjective: "Improve prose",
        chapterRewriteDirectives: [],
      },
      {
        chapters: [
          {
            chapter_number: 3,
            title: "Turning Point",
            summary: "Hero faces the key decision.",
          },
        ],
      },
    );

    const directives = result.chapterRewriteDirectives as Array<Record<string, unknown>>;
    expect(directives).toHaveLength(1);
    expect(directives[0].chapterNumber).toBe(3);
    expect(directives[0].chapterTitle).toBe("Turning Point");
    expect(String(directives[0].primaryGoal)).toContain("Hero faces the key decision");
  });
});
