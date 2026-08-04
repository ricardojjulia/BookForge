import { describe, expect, it } from "vitest";
import { getRewriteCoverage } from "@/lib/rewrite/coverage";

// Regression coverage for the "Rewrite coverage" dashboard widget, which
// previously displayed eligible-only denominators (excluding permanently
// ineligible paragraphs like import artifacts) and counted rejected drafts
// as "rewritten" -- together making a chapter with e.g. 36 real paragraphs,
// only 3 of them eligible and 2 actually accepted, read as "3/3" (100%)
// instead of the real "2/36".
describe("getRewriteCoverage", () => {
  it("reports real per-chapter totals/accepted counts alongside the eligibility-gated ones", () => {
    const chapter = { id: "ch-11", chapter_number: 11, title: "Chapter Eleven", exclude_from_rewrite: false };

    // 33 permanently-ineligible "paragraphs" (import pagination artifacts,
    // < 8 words each) plus 3 real, eligible paragraphs.
    const artifactParagraphs = Array.from({ length: 33 }, (_, i) => ({
      id: `artifact-${i}`,
      chapter_id: "ch-11",
      original_text: `-- ${i} of 30 --`,
      is_locked: false,
    }));
    const eligibleParagraphs = [
      { id: "p1", chapter_id: "ch-11", original_text: "This is a genuinely long real paragraph with plenty of words.", is_locked: false },
      { id: "p2", chapter_id: "ch-11", original_text: "Another substantial paragraph that easily clears the word count floor.", is_locked: false },
      { id: "p3", chapter_id: "ch-11", original_text: "A third real paragraph, also well above the eight word minimum threshold.", is_locked: false },
    ];
    const paragraphs = [...artifactParagraphs, ...eligibleParagraphs];

    // All 3 eligible paragraphs got SOME revision draft, but only 2 were
    // ever accepted (the third was rejected by auto-accept's weighted roll).
    const revisions = [{ paragraph_id: "p1" }, { paragraph_id: "p2" }, { paragraph_id: "p3" }];
    const acceptedParagraphIds = new Set(["p1", "p2"]);

    const [coverage] = getRewriteCoverage([chapter], paragraphs, revisions, acceptedParagraphIds);

    // Eligibility-gated fields (unchanged) -- still used to decide whether
    // "Rewrite this chapter" should be shown at all.
    expect(coverage.totalParagraphs).toBe(3);
    expect(coverage.rewrittenParagraphs).toBe(3);

    // Real fields -- what should actually be shown to the user.
    expect(coverage.realTotalParagraphs).toBe(36);
    expect(coverage.realRewrittenParagraphs).toBe(2);
  });
});
