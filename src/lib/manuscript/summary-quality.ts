export type ChapterSummaryQualityInput = {
  title: string | null;
  summary: string | null;
  originalText?: string | null;
};

export type ChapterSummaryQuality = {
  status: "good" | "review";
  score: number;
  reasons: string[];
};

const genericPhrases = [
  "appears to be",
  "only containing the title",
  "only the title",
  "no written content",
  "no descriptive content",
  "summary generated, but the model returned an empty summary field",
  "preserves the original language",
  "maintaining its authenticity",
  "introduction to the story",
  "the chapter is titled",
];

export function evaluateChapterSummaryQuality(input: ChapterSummaryQualityInput): ChapterSummaryQuality {
  const title = normalize(input.title || "");
  const summary = normalize(input.summary || "");
  const originalText = input.originalText || "";
  const originalWords = wordCount(originalText);
  const summaryWords = wordCount(summary);
  const reasons: string[] = [];
  let score = 100;

  if (!summary) {
    return {
      status: "review",
      score: 0,
      reasons: ["No summary has been saved."],
    };
  }

  if (originalWords < 20) {
    score -= 42;
    reasons.push("Stored chapter text is extremely short; this may be a table-of-contents entry or import artifact.");
  }

  if (summaryWords < 12) {
    score -= 28;
    reasons.push("Summary is too short to be useful as revision context.");
  }

  if (originalWords >= 250 && summaryWords < 25) {
    score -= 24;
    reasons.push("Chapter has substantial text, but the summary is very thin.");
  }

  if (title && (summary === title || summary.includes(title))) {
    score -= 18;
    reasons.push("Summary mostly repeats the chapter title.");
  }

  const matchedGeneric = genericPhrases.find((phrase) => summary.includes(phrase));
  if (matchedGeneric) {
    score -= 30;
    reasons.push(`Summary contains generic filler: "${matchedGeneric}".`);
  }

  if (originalWords >= 120 && /empty|no written content|only the title|only containing the title/.test(summary)) {
    score -= 36;
    reasons.push("Summary says the chapter is empty, but stored chapter text appears non-empty.");
  }

  if (!/[.!?]$/.test((input.summary || "").trim())) {
    score -= 8;
    reasons.push("Summary looks unfinished.");
  }

  const finalScore = Math.max(0, Math.min(100, score));
  return {
    status: finalScore >= 72 ? "good" : "review",
    score: finalScore,
    reasons: reasons.length ? reasons : ["Looks usable."],
  };
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
