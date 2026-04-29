export type AbridgementChapterInput = {
  id: string;
  chapterNumber: number;
  title: string;
  summary: string | null;
  paragraphCount: number;
  wordCount: number;
  sample: string;
};

export function buildAbridgementPlanPrompt(input: {
  title: string;
  targetReductionPercent: number;
  manuscriptBlueprint: unknown;
  chapters: AbridgementChapterInput[];
}) {
  return `You are BookForge AI's abridged-edition planner.

Goal: suggest how to reduce this book by about ${input.targetReductionPercent}% while preserving as much of the original idea, emotional meaning, continuity, worldview, and author voice as possible.

Important:
- Do not rewrite prose here.
- Do not silently remove important facts, theology/worldview, emotional meaning, character permanence, or continuity.
- Prefer suggestions that reduce repetition, duplicated emotional beats, over-explanation, redundant scene material, and chapters that repeat the same function.
- The author must approve every suggestion. Your job is to propose, not delete.
- Chapter merge suggestions are advisory. Paragraph/chapter cut suggestions can be approved for abridged export.

MANUSCRIPT BLUEPRINT:
${JSON.stringify(input.manuscriptBlueprint || {}, null, 2)}

CHAPTER INVENTORY:
${JSON.stringify(input.chapters, null, 2)}

Return only valid JSON:
{
  "summary": "",
  "estimatedOverallReductionPercent": 0,
  "preserveRequiredChapters": [{"chapterNumber": 1, "reason": ""}],
  "suggestions": [
    {
      "suggestionType": "cut_chapter | merge_chapter | cut_scene | merge_scene | cut_paragraph | tighten_paragraph",
      "chapterNumber": 1,
      "targetChapterNumber": 2,
      "paragraphNumber": 3,
      "title": "",
      "rationale": "",
      "estimatedWordSavings": 0,
      "continuityRisk": "low | medium | high"
    }
  ],
  "doNotCut": [{"chapterNumber": 1, "reason": ""}],
  "humanDecisionsNeeded": []
}`;
}
