export function buildCreationDraftChapterPrompt(input: {
  workingTitle: string;
  genre: string;
  targetAudience: string;
  language: string;
  targetPages: number;
  tone: string;
  boundaries: string;
  concept: unknown;
  architecture: unknown;
  chapter: { targetWords?: number; targetPages?: number; [key: string]: unknown };
  previousChapterSummary: string;
  nextChapterSummary: string;
}) {
  const targetWords = input.chapter.targetWords
    || (input.chapter.targetPages ? Math.round(input.chapter.targetPages * 250) : null)
    || Math.round((input.targetPages * 250) / 10);
  const wordFloor = Math.max(600, Math.round(targetWords * 0.8));
  const wordCeiling = Math.round(targetWords * 1.2);

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

AUTHOR BOUNDARIES:
${input.boundaries || "No special boundaries supplied."}

APPROVED CONCEPT:
${JSON.stringify(input.concept, null, 2)}

APPROVED ARCHITECTURE:
${JSON.stringify(input.architecture, null, 2)}

ASSIGNED CHAPTER:
${JSON.stringify(input.chapter, null, 2)}

PREVIOUS CHAPTER CONTEXT:
${input.previousChapterSummary || "This is the first generated chapter or no previous context was supplied."}

NEXT CHAPTER CONTEXT:
${input.nextChapterSummary || "No next chapter context was supplied."}

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
