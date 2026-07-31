import { describeDialogueDensity } from "@/lib/dialogue-density";

export function buildCreationArchitecturePrompt(input: {
  workingTitle: string;
  genre: string;
  targetAudience: string;
  language: string;
  targetPages: number;
  estimatedWords: number;
  expectedChapters: number;
  tone: string;
  boundaries: string;
  dialogDensity: string;
  concept: unknown;
}) {
  return `You are BookForge Architect. Build a chapter architecture from the approved concept.

Do not write manuscript prose yet. Design the book structure only.

Working title:
${input.workingTitle}

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

Dialogue density:
${describeDialogueDensity(input.dialogDensity)}

Contemporary View / forbidden boundaries:
${input.boundaries || "No special boundaries provided."}

Approved concept:
${compactJson(input.concept, 9000)}

Return only valid JSON. Do not use markdown fences. Do not include comments.

Return JSON with:
{
  "architectureSummary": "",
  "parts": [
    {
      "partNumber": 1,
      "title": "",
      "purpose": "",
      "chapters": [
        {
          "chapterNumber": 1,
          "title": "",
          "purpose": "",
          "targetWords": 0,
          "targetPages": 0,
          "emotionalMovement": "",
          "keyBeats": [],
          "charactersOrConcepts": [],
          "continuityNotes": [],
          "riskNotes": []
        }
      ]
    }
  ],
  "globalContinuityRules": [],
  "voiceRules": [],
  "motifsToDevelop": [],
  "generationWarnings": []
}

Rules:
- The total chapter word budget should roughly match the requested target words.
- Keep chapters bounded and draftable one at a time.
- Preserve the approved concept and author boundaries.
- Create enough structure to support coherent unit-by-unit generation.
- Use the requested output language for human-readable fields.`;
}

function compactJson(value: unknown, maxChars: number) {
  const json = JSON.stringify(value, null, 2) || "{}";
  if (json.length <= maxChars) return json;
  return `${json.slice(0, Math.max(0, maxChars - 120))}\n...\n[truncated by BookForge to fit model context budget]`;
}
