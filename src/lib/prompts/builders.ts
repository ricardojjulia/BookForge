import { describeDialogueDensity } from "@/lib/dialogue-density";
import type { RewriteStrategy } from "@/lib/rewrite/strategies";

export function buildBookBiblePrompt(text: string, options?: { maxSampleChars?: number }) {
  const maxSampleChars = Math.max(2000, Math.min(60000, Math.floor(options?.maxSampleChars || 24000)));
  const manuscriptSample = text.slice(0, maxSampleChars);
  return `Generate a structured Manuscript Blueprint for this manuscript sample.

Return only valid JSON. Do not use markdown fences. Do not include comments. Use double-quoted property names and string values.

Return JSON with:
{
  "summary": "",
  "genre": "",
  "targetAudience": "",
  "pointOfView": "",
  "tense": "",
  "tone": "",
  "authorialVoice": "",
  "majorThemes": [{ "name": "", "description": "" }],
  "recurringMotifs": [{ "name": "", "description": "" }],
  "characters": [{ "name": "", "role": "", "description": "", "arcNotes": "", "voiceNotes": "", "relationshipNotes": "" }],
  "relationships": [],
  "timeline": [{ "event": "", "chapterNumber": 1, "sequenceOrder": 1 }],
  "locations": [{ "name": "", "description": "" }],
  "unresolvedPlotThreads": [],
  "styleRules": [],
  "forbiddenChanges": []
}

For characters, locations, themes, motifs, and timeline events, return one object per distinct manuscript fact. Use the visible chapter number for timeline.chapterNumber when known. Do not invent missing details.

MANUSCRIPT SAMPLE:
${manuscriptSample}`;
}

export function buildChapterSummaryPrompt(input: { title: string; text: string }) {
  return `Summarize this chapter for future book revision context.

Return only valid JSON. Do not use markdown fences. Do not include comments. Use double-quoted property names and string values.

Return JSON with:
{
  "chapterSummary": "",
  "charactersPresent": [],
  "locations": [],
  "importantEvents": [],
  "emotionalBeats": [],
  "motifs": [],
  "timelineNotes": [],
  "continuityNotes": []
}

Important:
- Preserve the chapter's language and cultural context.
- Do not invent events, characters, or themes that are not present.
- The chapterSummary must be populated with 2-4 specific sentences when chapter body text is present.
- Mention concrete events, emotional movement, character roles, or thematic development when visible.
- Do not summarize by saying only that the chapter is titled something.
- If the chapter truly contains no body text beyond headings/front matter, say: "No chapter body text detected."
- Flag continuity concerns in continuityNotes instead of changing facts.

CHAPTER TITLE:
${input.title}

CHAPTER TEXT:
${input.text.slice(0, 30000)}`;
}

export function buildFullBookRewriteUnitPrompt(input: {
  manuscriptBlueprint: unknown;
  rewritePlan: unknown;
  contextPacket?: unknown;
  chapterTitle: string;
  chapterSummary?: string | null;
  previousChapterSummary?: string | null;
  nextChapterSummary?: string | null;
  previousParagraph?: string | null;
  nextParagraph?: string | null;
  rewriteStrategy?: RewriteStrategy | null;
  authorInstructions?: string | null;
  voiceProfile?: unknown;
  dialogDensity?: string | null;
  paragraphNumber: number;
  text: string;
}) {
  return `You are rewriting one small unit of a book manuscript as part of a full-book rewrite.

This is not an isolated rewrite. You must preserve whole-book context, continuity, character permanence, timeline logic, motifs, contemporary view, emotional meaning, and author voice.

MANUSCRIPT BLUEPRINT:
${compactJson(input.manuscriptBlueprint || {}, 7000)}

REWRITE ARCHITECT PLAN:
${compactJson(input.rewritePlan || {}, 7000)}

REQUIRED CONTEXT PACKET FOR THIS CALL:
${compactJson(input.contextPacket || {}, 7000)}

AUTHOR VOICE PROFILE:
${input.voiceProfile ? compactJson(input.voiceProfile, 1500) : "Not captured. Infer voice from the manuscript blueprint and surrounding text."}

REWRITE STRATEGY:
${input.rewriteStrategy ? formatRewriteStrategy(input.rewriteStrategy) : "Use the Rewrite Architect plan with balanced humanized literary polish."}

AUTHOR STRATEGY INSTRUCTIONS:
${input.authorInstructions || "No extra author instructions for this run."}

DIALOGUE DENSITY TARGET:
${describeDialogueDensity(input.dialogDensity)}
If this paragraph's content naturally supports it (a scene with interacting characters, not pure narration/description/internal reflection), nudge its dialogue-to-narration balance toward this target. Never force dialogue into a paragraph where it would feel unnatural or damage coherence.

CURRENT CHAPTER:
${input.chapterTitle}

CURRENT CHAPTER SUMMARY:
${truncateText(input.chapterSummary || "Not available.", 1800)}

PREVIOUS CHAPTER SUMMARY:
${truncateText(input.previousChapterSummary || "Not available.", 1200)}

NEXT CHAPTER SUMMARY:
${truncateText(input.nextChapterSummary || "Not available.", 1200)}

LOCAL CONTEXT BEFORE THIS PARAGRAPH:
${truncateText(input.previousParagraph || "None.", 1200)}

LOCAL CONTEXT AFTER THIS PARAGRAPH:
${truncateText(input.nextParagraph || "None.", 1200)}

PARAGRAPH NUMBER:
${input.paragraphNumber}

TEXT TO REWRITE:
${input.text}

Return only valid JSON. Do not use markdown fences. Do not include comments.

Return JSON with:
{
  "revisedText": "",
  "revisionNotes": "",
  "continuityWarnings": [],
  "ledgerUpdates": [],
  "confidence": 0
}

Rules:
- Rewrite only TEXT TO REWRITE.
- Do not rewrite the neighboring context.
- Do not rename characters.
- Do not change facts, relationships, timeline, ending, contemporary view, or emotional meaning.
- Preserve the author's language when the manuscript is not in English.
- Improve prose, clarity, rhythm, emotional force, and specificity only when it does not damage coherence.
- Follow the selected rewrite strategy and its limits for expansion, voice preservation, readability, literary intensity, contemporary-view emphasis, and continuity strictness.
- Where natural for this paragraph's content, move its dialogue-to-narration balance toward the DIALOGUE DENSITY TARGET above; do not force it where it doesn't fit.
- Treat the required context packet as binding. Preserve accepted prior revisions, locked passages, continuity facts, Critic priorities, and chapter directives.
- If a packet field is marked unavailable, do not invent it. Preserve the original text and flag uncertainty in continuityWarnings.
- If improving the paragraph would require changing a fact or continuity, preserve the original and put the concern in continuityWarnings.
- Keep paragraph breaks out of revisedText unless the original paragraph genuinely needs a split.`;
}

function formatRewriteStrategy(strategy: RewriteStrategy) {
  return [
    `${strategy.label}: ${strategy.summary}`,
    `Best for: ${strategy.bestFor}`,
    "Instructions:",
    ...strategy.instructions.map((instruction) => `- ${instruction}`),
    "Settings:",
    `- voicePreservation: ${strategy.settings.voicePreservation}/100`,
    `- expansionLimitPercent: ${strategy.settings.expansionLimitPercent}%`,
    `- sentenceRhythm: ${strategy.settings.sentenceRhythm}/100`,
    `- literaryIntensity: ${strategy.settings.literaryIntensity}/100`,
    `- readabilityTarget: ${strategy.settings.readabilityTarget}`,
    `- theologicalEmphasis: ${strategy.settings.theologicalEmphasis}/100`,
    `- continuityStrictness: ${strategy.settings.continuityStrictness}/100`,
    `- targetReductionPercent: ${strategy.settings.targetReductionPercent}%`,
    strategy.settings.targetReductionPercent > 0
      ? `Compression mandate: aim to reduce this unit by about ${strategy.settings.targetReductionPercent}% while preserving core meaning. Do not remove important facts, emotional truth, worldview meaning, continuity, or author voice. Mention possible chapter consolidation in revisionNotes instead of changing chapter structure.`
      : "",
  ].join("\n");
}

function compactJson(value: unknown, maxChars: number) {
  return truncateText(JSON.stringify(value, null, 2), maxChars);
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n...[truncated for local model context]`;
}
