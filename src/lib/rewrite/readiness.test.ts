import { describe, expect, it } from "vitest";
import { getRewriteReadiness } from "@/lib/rewrite/readiness";
import { getDefaultRewriteWorkflow } from "@/lib/rewrite/workflows";

// Regression coverage for the mark-finished fix: completing an Auto-Review
// run now sets workflow.strategy_approved = true, which should take the
// "Full Spread Coverage" item out of a hard "blocked" state even while
// paragraphs remain untouched -- previously this item (and therefore the
// whole gate) stayed permanently "blocked" after every auto-review run,
// contradicting the book having just been marked finished.
describe("getRewriteReadiness", () => {
  const baseInput = {
    bookId: "book-1",
    hasBlueprint: true,
    hasRewritePlan: true,
    chapters: [],
    criticReports: [],
    latestRewriteJobId: "job-1",
    pendingDraftParagraphCount: 0,
    acceptedParagraphCount: 13,
    untouchedParagraphCount: 55,
    latestDriftReportId: "drift-1",
  };

  it("blocks coverage when the strategy has not been approved", () => {
    const readiness = getRewriteReadiness({
      ...baseInput,
      workflow: { ...getDefaultRewriteWorkflow("book-1"), strategy_approved: false },
    });
    const coverage = readiness.items.find((item) => item.key === "coverage");
    const strategy = readiness.items.find((item) => item.key === "strategy");
    expect(strategy?.status).toBe("recommended");
    expect(coverage?.status).toBe("blocked");
  });

  it("downgrades coverage to 'recommended' once strategy_approved is true, even with untouched paragraphs remaining", () => {
    const readiness = getRewriteReadiness({
      ...baseInput,
      workflow: { ...getDefaultRewriteWorkflow("book-1"), strategy_approved: true },
    });
    const coverage = readiness.items.find((item) => item.key === "coverage");
    const strategy = readiness.items.find((item) => item.key === "strategy");
    expect(strategy?.status).toBe("ready");
    expect(coverage?.status).toBe("recommended");
    expect(coverage?.status).not.toBe("blocked");
  });
});
