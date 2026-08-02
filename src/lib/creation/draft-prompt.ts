import { describeDialogueDensity } from "@/lib/dialogue-density";
import { WORDS_PER_PAGE } from "@/lib/manuscript/page-estimate";

export function buildCreationDraftChapterPrompt(input: {
  workingTitle: string;
  genre: string;
  targetAudience: string;
  language: string;
  targetPages: number;
  tone: string;
  boundaries: string;
  dialogDensity: string;
  concept: unknown;
  architecture: unknown;
  chapter: { targetWords?: number; targetPages?: number; [key: string]: unknown };
  previousChapterSummary: string;
  nextChapterSummary: string;
  promptCharBudget?: number;
}) {
  const promptBudget = clampNumber(input.promptCharBudget || 0, 5000, 36000);
  const targetWords = input.chapter.targetWords
    || (input.chapter.targetPages ? Math.round(input.chapter.targetPages * WORDS_PER_PAGE) : null)
    || Math.round((input.targetPages * WORDS_PER_PAGE) / 10);
  const wordFloor = Math.max(600, Math.round(targetWords * 0.8));
  const wordCeiling = Math.round(targetWords * 1.2);
  const conceptBudget = Math.max(1200, Math.floor(promptBudget * 0.22));
  const architectureBudget = Math.max(2200, Math.floor(promptBudget * 0.42));
  const chapterBudget = Math.max(700, Math.floor(promptBudget * 0.16));
  const neighboringBudget = Math.max(400, Math.floor(promptBudget * 0.08));

  return `You are BookForge Creator drafting one chapter of a book.

Write manuscript prose for the assigned chapter only. Do not draft the whole book.

BOOK:
${input.workingTitle}

GENRE:
${input.genre || "Unspecified"}

TARGET AUDIENCE:
${input.targetAudience || "Unspecified"}

LANGUAGE:
${input.language || "English"}

CHAPTER WORD COUNT TARGET:
Write between ${wordFloor.toLocaleString()} and ${wordCeiling.toLocaleString()} words for this chapter. This is a hard requirement — do not produce a summary or placeholder. Write the full chapter prose now.

TONE:
${input.tone || "No special tone supplied."}

DIALOGUE DENSITY:
${describeDialogueDensity(input.dialogDensity)}

AUTHOR BOUNDARIES:
${input.boundaries || "No special boundaries supplied."}

APPROVED CONCEPT:
${compactJson(input.concept, conceptBudget)}

APPROVED ARCHITECTURE:
${compactJson(input.architecture, architectureBudget)}

ASSIGNED CHAPTER:
${compactJson(input.chapter, chapterBudget)}

PREVIOUS CHAPTER CONTEXT:
${truncateText(input.previousChapterSummary || "This is the first generated chapter or no previous context was supplied.", neighboringBudget)}

NEXT CHAPTER CONTEXT:
${truncateText(input.nextChapterSummary || "No next chapter context was supplied.", neighboringBudget)}

Rules:
- Draft only the assigned chapter.
- Write the complete chapter — ${wordFloor.toLocaleString()} words minimum, multiple scenes and paragraphs.
- Preserve continuity with the approved architecture.
- Do not contradict prior or upcoming chapters.
- Do not include markdown fences.
- Do not include analysis before or after the chapter.
- Do not include a title page or table of contents.
- Use natural book prose, not outline bullets.
- Use paragraph breaks between scenes and ideas.
- Keep the language consistent with the requested language.

Return ONLY valid JSON with this exact structure. The "chapterText" value must be the complete prose — not a description of what you would write, not a placeholder:

{"chapterText":"<write the full chapter prose here — ${wordFloor.toLocaleString()} words minimum>","chapterSummary":"<one sentence>","continuityNotes":[],"generationNotes":[]}`;
}

function compactJson(value: unknown, maxChars: number) {
  const json = JSON.stringify(value, null, 2) || "{}";
  if (json.length <= maxChars) return json;
  return `${json.slice(0, Math.max(0, maxChars - 120))}\n...\n[truncated by BookForge to fit model context budget]`;
}

function truncateText(text: string, maxChars: number) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 60))} ...[truncated]`;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
