// A book brought in via manuscript import already has real prose in
// original_text/current_text but never gets an AI-generated chapter.summary
// (that field is only ever written as a byproduct of generate-draft's
// per-chapter drafting call). Without a fallback, every prompt that reads
// chapter.summary sees "No summary yet." for every chapter of an imported
// book -- Critic and the Rewrite Architect Plan both evaluate/plan against a
// manuscript they never actually read. Shared here since both call sites
// need the same excerpt derivation from a chapter's own paragraphs.
//
// The caller's own prompt-budget truncation cuts this further per-chapter,
// so the cap here just avoids holding an unnecessarily large string for a
// very long chapter -- it doesn't need to match any specific prompt budget.
const FALLBACK_EXCERPT_CHAR_LIMIT = 4000;

type FallbackParagraphRow = {
  chapter_id: string | null | undefined;
  paragraph_number: number;
  original_text: string;
  accepted_text?: string | null;
};

export function buildChapterFallbackExcerpts(
  chapterRows: Array<{ id: string }>,
  paragraphRows: FallbackParagraphRow[],
): Map<string, string> {
  const paragraphsByChapter = new Map<string, FallbackParagraphRow[]>();
  for (const paragraph of paragraphRows) {
    if (!paragraph.chapter_id) continue;
    const list = paragraphsByChapter.get(paragraph.chapter_id);
    if (list) list.push(paragraph);
    else paragraphsByChapter.set(paragraph.chapter_id, [paragraph]);
  }

  const excerpts = new Map<string, string>();
  for (const chapter of chapterRows) {
    const paragraphs = (paragraphsByChapter.get(chapter.id) || [])
      .slice()
      .sort((a, b) => a.paragraph_number - b.paragraph_number);
    const text = paragraphs
      .map((paragraph) => paragraph.accepted_text || paragraph.original_text)
      .join("\n\n")
      .trim();
    if (text) excerpts.set(chapter.id, text.slice(0, FALLBACK_EXCERPT_CHAR_LIMIT));
  }
  return excerpts;
}
