export type SceneSplitParagraphInput = {
  paragraphNumber: number;
  text: string;
};

export function buildSceneSplitPrompt(input: {
  chapterTitle: string;
  chapterNumber: number;
  targetWordsPerScene?: number;
  paragraphs: SceneSplitParagraphInput[];
  promptCharBudget?: number;
}) {
  const targetWordsPerScene = input.targetWordsPerScene || 2000;
  const budget = Math.max(6000, (input.promptCharBudget || 24000) - 3000);
  const perParagraphBudget = Math.max(200, Math.floor(budget / Math.max(1, input.paragraphs.length)));
  const paragraphInventory = input.paragraphs.map((paragraph) => ({
    paragraphNumber: paragraph.paragraphNumber,
    text: limitText(paragraph.text, perParagraphBudget),
  }));

  return `You are BookForge AI's scene-boundary planner.

Chapter ${input.chapterNumber}: "${input.chapterTitle}" is currently one continuous block of text with no internal scene breaks (or too few). Your job is to propose where NEW scenes should start.

Goal: find natural scene-break points -- a shift in location, time, point of view, or narrative beat -- so that AI rewrite calls on this chapter can process one coherent scene at a time instead of the whole chapter at once.

Guidance, not a hard rule: aim for scenes landing near ${targetWordsPerScene} words each. Do NOT split at an arbitrary word count if it would cut through the middle of a continuous beat -- a real narrative shift always takes priority over hitting the target length exactly. It is fine to propose zero splits if the chapter genuinely reads as one continuous scene.

Rules:
- Do not rewrite, summarize, or alter any prose. Propose split points only.
- A split point is the paragraph NUMBER where a new scene begins. Never propose paragraph 1 (that's the start of the chapter, not a new scene).
- Give each proposed scene a short, evocative title (not "Scene 2") and a one-sentence rationale citing what actually changes at that point (e.g. "time jump to the next morning", "POV shifts to the father").
- Propose splits in ascending paragraph-number order, and only where you are confident a real narrative shift occurs.

CHAPTER PARAGRAPHS (numbered):
${JSON.stringify(paragraphInventory, null, 2)}

Return only valid JSON, no markdown fences:
{
  "suggestions": [
    { "startParagraphNumber": 0, "title": "", "rationale": "" }
  ]
}`;
}

function limitText(value: string, maxCharacters: number) {
  if (value.length <= maxCharacters) return value;
  return `${value.slice(0, Math.max(0, maxCharacters - 40)).trimEnd()}\n[Truncated to fit LM Studio context.]`;
}
