import type { CriticLens } from "@/lib/types";

export const criticLenses: Record<CriticLens, { label: string; instruction: string }> = {
  story_structure: {
    label: "Story Structure",
    instruction: "Evaluate premise clarity, chapter movement, stakes, escalation, payoff, and ending promise.",
  },
  prose_quality: {
    label: "Prose Quality",
    instruction: "Evaluate sentence craft, imagery, rhythm, specificity, clarity, repetition, and voice.",
  },
  continuity: {
    label: "Continuity",
    instruction: "Find contradictions in timeline, names, facts, setting, unresolved threads, and relationships.",
  },
  character_depth: {
    label: "Character Depth",
    instruction: "Evaluate character agency, arcs, differentiation, dialogue voice, motivation, and emotional believability.",
  },
  market_fit: {
    label: "Market Fit",
    instruction: "Evaluate likely audience fit, genre expectations, positioning, hooks, and reader promise.",
  },
  theology_worldview: {
    label: "Theology / Worldview",
    instruction: "Evaluate alignment, tonal drift, overstatement, unwanted framing, and philosophical consistency.",
  },
  revision_priorities: {
    label: "Revision Priorities",
    instruction: "Rank the highest-leverage fixes by impact, effort, and recommended order of operations.",
  },
};

export function buildCriticPrompt(input: {
  title: string;
  bookBible?: unknown;
  chapterSummaries: Array<{ title: string; summary: string | null }>;
  rewriteStage?: "baseline" | "post_rewrite";
  acceptedRevisionContext?: Array<{ title: string; acceptedTextSample: string; acceptedParagraphs: number; totalParagraphs: number }>;
  lens: CriticLens;
}) {
  const lens = criticLenses[input.lens];
  const stageLabel = input.rewriteStage === "post_rewrite" ? "POST-REWRITE EVALUATION" : "BASELINE EVALUATION";

  return `You are BookForge Critic, a direct but constructive book evaluator.

Evaluation stage:
${stageLabel}

Evaluation lens:
${lens.label}: ${lens.instruction}

Book title:
${input.title}

Manuscript Blueprint:
${JSON.stringify(input.bookBible || {}, null, 2)}

Chapter summaries:
${input.chapterSummaries
  .map((chapter, index) => `${index + 1}. ${chapter.title}: ${chapter.summary || "No summary yet."}`)
  .join("\n")}

${
  input.acceptedRevisionContext?.length
    ? `Accepted rewrite context:
${input.acceptedRevisionContext
  .map(
    (chapter, index) =>
      `${index + 1}. ${chapter.title} (${chapter.acceptedParagraphs}/${chapter.totalParagraphs} accepted paragraphs)\n${chapter.acceptedTextSample}`,
  )
  .join("\n\n")}`
    : ""
}

Return only valid JSON. Do not use markdown fences. Do not include comments. Use double-quoted property names and string values.

Return valid JSON with:
{
  "score": 0,
  "scoreBreakdown": {},
  "executiveSummary": "",
  "strengths": [],
  "risks": [],
  "highestLeverageFixes": [],
  "chapterNotes": [],
  "continuityFlags": [],
  "voiceAndStyleNotes": [],
  "marketPositioning": [],
  "nextRevisionPlan": []
}

Rules:
- The score field must be one numeric value from 0 to 100. Do not return an object, rubric, or sub-score map in score.
- If useful, put sub-scores in scoreBreakdown while keeping score numeric.
- Be specific and useful, not vague.
- Do not rewrite the manuscript.
- Flag issues and suggest fixes.
- Preserve author voice, theological meaning, and intended audience.`;
}
