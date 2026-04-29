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
  chapter: unknown;
  previousChapterSummary: string;
  nextChapterSummary: string;
}) {
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

TARGET LENGTH:
${input.targetPages} pages total. Respect the chapter target in the architecture.

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
- Preserve continuity with the approved architecture.
- Do not contradict prior or upcoming chapters.
- Do not include markdown fences.
- Do not include analysis before or after the chapter.
- Do not include a title page or table of contents.
- Use natural book prose, not outline bullets.
- Use paragraph breaks.
- Keep the language consistent with the requested language.

Return only valid JSON:
{
  "chapterText": "",
  "chapterSummary": "",
  "continuityNotes": [],
  "generationNotes": []
}`;
}
