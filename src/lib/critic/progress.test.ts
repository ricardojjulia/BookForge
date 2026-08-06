import { describe, expect, it, vi } from "vitest";

describe("critic progress", () => {
  it("counts baseline and post lenses correctly against the real lens set", async () => {
    const { computeCriticProgress, CRITIC_LENS_COUNT } = await import("@/lib/critic/progress");
    const { criticLenses } = await import("@/lib/critic/prompts");
    const lenses = Object.keys(criticLenses);

    const reports = lenses.flatMap((lens) => [{ report_type: `critic:${lens}` }, { report_type: `critic_post:${lens}` }]);

    const progress = computeCriticProgress(reports);

    expect(progress.totalLenses).toBe(CRITIC_LENS_COUNT);
    expect(progress.baselineCount).toBe(lenses.length);
    expect(progress.postCount).toBe(lenses.length);
    expect(progress.baselineComplete).toBe(true);
    expect(progress.postComplete).toBe(true);
    expect(progress.missingBaselineLenses).toEqual([]);
    expect(progress.missingPostLenses).toEqual([]);
  });

  it("reports missing lenses when some are absent", async () => {
    const { computeCriticProgress } = await import("@/lib/critic/progress");
    const { criticLenses } = await import("@/lib/critic/prompts");
    const [firstLens] = Object.keys(criticLenses);

    const progress = computeCriticProgress([{ report_type: `critic_post:${firstLens}` }]);

    expect(progress.postCount).toBe(1);
    expect(progress.postComplete).toBe(false);
    expect(progress.missingPostLenses).not.toContain(firstLens);
    expect(progress.missingPostLenses.length).toBe(Object.keys(criticLenses).length - 1);
  });

  it("does not false-positive on an unrelated report_type that merely starts with the same prefix", async () => {
    const { isCriticReportType } = await import("@/lib/critic/progress");

    expect(isCriticReportType("critic_baseline_stage_started")).toBe(false);
    expect(isCriticReportType("critic:not_a_real_lens")).toBe(false);
    expect(isCriticReportType("rewrite_plan")).toBe(false);
    expect(isCriticReportType("critic:story_structure")).toBe(true);
    expect(isCriticReportType("critic_post:dialogue_density")).toBe(true);
  });

  it("derives the lens count from criticLenses, not a hardcoded literal", async () => {
    vi.resetModules();
    vi.doMock("@/lib/critic/prompts", () => ({
      criticLenses: {
        lens_one: { label: "One", instruction: "" },
        lens_two: { label: "Two", instruction: "" },
        lens_three: { label: "Three", instruction: "" },
      },
    }));

    const { CRITIC_LENS_COUNT, computeCriticProgress } = await import("@/lib/critic/progress");

    expect(CRITIC_LENS_COUNT).toBe(3);
    const progress = computeCriticProgress([{ report_type: "critic_post:lens_one" }]);
    expect(progress.totalLenses).toBe(3);
    expect(progress.missingPostLenses).toEqual(["lens_two", "lens_three"]);

    vi.doUnmock("@/lib/critic/prompts");
    vi.resetModules();
  });
});
