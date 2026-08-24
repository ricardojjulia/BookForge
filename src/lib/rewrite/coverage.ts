import { shouldSkipParagraph } from "@/lib/rewrite/eligibility";

export function getRewriteCoverage(
  chapters: Array<{ id: string; chapter_number: number; title: string | null; exclude_from_rewrite?: boolean | null }>,
  paragraphs: Array<{ id: string; chapter_id: string; original_text?: string | null; is_locked?: boolean | null }>,
  revisions: Array<{ paragraph_id: string | null }>,
  acceptedParagraphIds: Set<string>,
  pendingDraftParagraphIds: Set<string> = new Set(),
) {
  const paragraphIdsWithRevisions = new Set(revisions.map((revision) => revision.paragraph_id).filter(Boolean));
  const paragraphsByChapter = paragraphs.reduce<Record<string, typeof paragraphs>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});

  return chapters.map((chapter) => {
    const chapterParagraphs = paragraphsByChapter[chapter.id] || [];
    // "Total"/"rewrittenParagraphs" here deliberately count only paragraphs
    // that could ever actually be rewritten -- otherwise a chapter with any
    // locked/too-short/title-echo paragraph (nearly every chapter has at
    // least one) shows rewrittenParagraphs < totalParagraphs forever,
    // keeping "Rewrite this chapter" visible even after genuine full
    // coverage, so clicking it just silently does nothing. These two fields
    // exist purely to gate that button/campaign-sizing logic -- see
    // realTotalParagraphs/realRewrittenParagraphs below for what should
    // actually be displayed to a user asking "how much of my book is done."
    const eligibleParagraphs = chapter.exclude_from_rewrite
      ? []
      : chapterParagraphs.filter(
          (paragraph) => !paragraph.is_locked && !shouldSkipParagraph(paragraph.original_text || "", chapter.title),
        );
    const rewritten = eligibleParagraphs.filter((paragraph) => paragraphIdsWithRevisions.has(paragraph.id)).length;
    // Honest numbers for display: every real paragraph in the chapter, and
    // only ones actually accepted into the manuscript (not merely drafted
    // and then rejected/redone by auto-accept).
    const realRewrittenParagraphs = chapterParagraphs.filter((paragraph) => acceptedParagraphIds.has(paragraph.id)).length;
    // Paragraphs with a drafted revision still awaiting an accept/reject
    // decision -- distinct from realRewrittenParagraphs (accepted only) and
    // from eligibleParagraphs (which counts a paragraph as "rewritten" the
    // moment it has ANY revision, pending or accepted). Exists purely so the
    // UI can tell a user "N paragraphs here need your review" rather than
    // leaving that state indistinguishable from "still eligible, untouched."
    const pendingParagraphs = chapterParagraphs.filter((paragraph) => pendingDraftParagraphIds.has(paragraph.id)).length;
    return {
      chapterId: chapter.id,
      chapterNumber: chapter.chapter_number,
      title: chapter.title,
      totalParagraphs: eligibleParagraphs.length,
      rewrittenParagraphs: rewritten,
      realTotalParagraphs: chapterParagraphs.length,
      realRewrittenParagraphs,
      pendingParagraphs,
    };
  });
}
