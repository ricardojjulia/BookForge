// A paragraph that is really just a bare structural label -- an outline
// heading like "F. Strengths and Weaknesses", a title-page line like "My
// Life Story", or a section marker like "Introduction" -- should never be
// (a) sent to the AI to be rewritten into invented narrative prose, or (b)
// shown verbatim in a rewritten manuscript's final export. Both failure
// modes were found live on a real imported memoir: forcing a rewrite on
// these fragments produced duplicate/invented filler (front-matter lines
// each independently rewritten into near-identical "opening" paragraphs),
// while leaving them un-rewritten let them survive as raw outline debris
// scattered through an otherwise-polished export. This heuristic is the
// single source of truth both call sites (rewrite eligibility and export
// paragraph selection) use to identify that class of paragraph.
const NUMBERED_OR_LETTERED_HEADING = /^(?:[0-9]+|[A-Za-z]|[IVXLCDM]+)\.\s+\S/;

// Real prose -- even a one-word line of dialogue -- overwhelmingly ends
// with terminal punctuation; a bare heading/label never does. Checked
// before the single-word branch below so an unpunctuated interjection
// isn't mistaken for a heading.
const TERMINAL_PUNCTUATION = /[.!?…,:;]$/;

// Only single words from this list are treated as headings on their own;
// an arbitrary one-word paragraph like "Wait" or "Stop" (rare, but
// possible as unpunctuated dialogue) must not be swept up.
const SINGLE_WORD_HEADING_KEYWORDS = new Set([
  "introduction",
  "introducción",
  "conclusion",
  "conclusión",
  "prologue",
  "prólogo",
  "epilogue",
  "epílogo",
  "afterword",
  "preface",
  "foreword",
]);

export function looksLikeStructuralHeading(text: string, chapterTitle?: string | null): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (chapterTitle && trimmed.toLowerCase() === chapterTitle.trim().toLowerCase()) {
    return true;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;
  if (TERMINAL_PUNCTUATION.test(trimmed)) return false;

  if (words.length === 1) {
    return SINGLE_WORD_HEADING_KEYWORDS.has(trimmed.toLowerCase());
  }

  if (NUMBERED_OR_LETTERED_HEADING.test(trimmed)) return true;

  // Title Case heading convention -- most words capitalized, with no
  // lowercase connective words dominating. Distinguishes a heading like
  // "Getting Along With People" from an ordinary short, unpunctuated
  // sentence (rare in well-formed prose, but the ratio still favors real
  // sentences since they're built mostly from lowercase words).
  const capitalizedWords = words.filter((word) => /^[A-ZÀ-ÖØ-Þ]/.test(word));
  if (words.length <= 8 && capitalizedWords.length / words.length >= 0.7) return true;

  return false;
}
