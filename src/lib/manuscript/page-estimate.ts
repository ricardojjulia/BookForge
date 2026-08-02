// Calibrated against real PDFKit output (src/lib/export/pdf.ts's actual
// font/margin/line-gap settings: 11.5pt Helvetica, 1" margins, 3pt line gap,
// LETTER size) rendering a real ~26k-word, 11-chapter manuscript: pure body
// text fits ~510 words/page, and every chapter starting on a fresh page
// wastes roughly half a page on average. WORDS_PER_PAGE bakes in a
// representative per-chapter overhead so `pages = words / WORDS_PER_PAGE`
// tracks actual exported PDF length far more closely than the previous,
// unvalidated 250/275 words/page figures used across the app (which
// undercounted real page capacity by roughly half).
export const WORDS_PER_PAGE = 460;

export function estimateWordsForPages(pages: number) {
  return Math.round(pages * WORDS_PER_PAGE);
}

export function estimatePagesForWords(words: number) {
  return Math.max(1, Math.round(words / WORDS_PER_PAGE));
}
