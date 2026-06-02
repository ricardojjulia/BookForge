export function buildCreationConceptPrompt(input: {
  workingTitle: string;
  idea: string;
  genre: string;
  targetAudience: string;
  language: string;
  targetPages: number;
  tone: string;
  boundaries: string;
  creationMode: string;
  estimatedWords: number;
  expectedChapters: number;
}) {
  return `You are BookForge Creator, helping an author design a book before drafting it.

Create a concept pass only. Do not write manuscript chapters yet.

Working title:
${input.workingTitle}

Core idea:
${input.idea}

Genre:
${input.genre}

Target audience:
${input.targetAudience}

Language:
${input.language}

Target length:
${input.targetPages} pages, approximately ${input.estimatedWords} words, around ${input.expectedChapters} chapters.

Tone:
${input.tone || "Author has not specified tone yet."}

Contemporary View / forbidden boundaries:
${input.boundaries || "No special boundaries provided."}

Creation mode:
${input.creationMode}

Return only valid JSON. Do not use markdown fences. Do not include comments.

Return JSON with:
{
  "mainTheme": "",
  "readerPromise": "",
  "premise": "",
  "emotionalEngine": "",
  "genreFit": "",
  "targetAudienceFit": "",
  "creationThesis": "",
  "suggestedStructure": [
    {
      "partTitle": "",
      "purpose": "",
      "chapterCount": 0
    }
  ],
  "coreQuestions": [],
  "majorRisks": [],
  "differentiators": [],
  "recommendedNextQuestionsForAuthor": [],
  "modelStrategyRecommendation": {
    "mode": "single_safe | dual_role_sequential",
    "reason": ""
  }
}

Rules:
- Keep the concept practical enough to become a chapter architecture.
- Respect the author's boundaries.
- Do not invent a finished manuscript.
- Do not exceed the requested target length.
- If the idea is vague, propose clarifying questions rather than overcommitting.
- Use the requested output language for human-readable fields.`;
}
