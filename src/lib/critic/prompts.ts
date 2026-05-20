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
  promptCharBudget?: number;
}) {
  const lens = criticLenses[input.lens];
  const stageLabel = input.rewriteStage === "post_rewrite" ? "POST-REWRITE EVALUATION" : "BASELINE EVALUATION";
  const budget = splitCriticPromptBudget(
    Math.min(input.promptCharBudget || 24000, 24000),
    Boolean(input.acceptedRevisionContext?.length),
  );
  const bookBible = limitText(JSON.stringify(input.bookBible || {}, null, 2), budget.bookBible);
  const chapterSummaries = limitChapterSummaries(input.chapterSummaries, budget.chapterSummaries);
  const acceptedRevisionContext = input.acceptedRevisionContext?.length
    ? limitAcceptedRevisionContext(input.acceptedRevisionContext, budget.acceptedRevisionContext)
    : "";

  return `You are BookForge Critic, a direct but constructive book evaluator.

Evaluation stage:
${stageLabel}

Evaluation lens:
${lens.label}: ${lens.instruction}

Book title:
${input.title}

Manuscript Blueprint:
${bookBible}

Chapter summaries:
${chapterSummaries}

${
  acceptedRevisionContext
    ? `Accepted rewrite context:
${acceptedRevisionContext}`
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

function splitCriticPromptBudget(totalBudget: number, hasAcceptedRevisionContext: boolean) {
  const budget = Math.max(6000, totalBudget - 5000);
  if (hasAcceptedRevisionContext) {
    return {
      bookBible: Math.floor(budget * 0.32),
      chapterSummaries: Math.floor(budget * 0.38),
      acceptedRevisionContext: Math.floor(budget * 0.3),
    };
  }

  return {
    bookBible: Math.floor(budget * 0.42),
    chapterSummaries: Math.floor(budget * 0.58),
    acceptedRevisionContext: 0,
  };
}

function limitChapterSummaries(chapters: Array<{ title: string; summary: string | null }>, budget: number) {
  const perChapter = Math.max(220, Math.floor(budget / Math.max(1, chapters.length)));
  return limitText(
    chapters
      .map((chapter, index) => `${index + 1}. ${chapter.title}: ${limitText(chapter.summary || "No summary yet.", perChapter)}`)
      .join("\n"),
    budget,
  );
}

function limitAcceptedRevisionContext(
  chapters: Array<{ title: string; acceptedTextSample: string; acceptedParagraphs: number; totalParagraphs: number }>,
  budget: number,
) {
  const perChapter = Math.max(180, Math.floor(budget / Math.max(1, chapters.length)));
  return limitText(
    chapters
      .map(
        (chapter, index) =>
          `${index + 1}. ${chapter.title} (${chapter.acceptedParagraphs}/${chapter.totalParagraphs} accepted paragraphs)\n${limitText(
            chapter.acceptedTextSample,
            perChapter,
          )}`,
      )
      .join("\n\n"),
    budget,
  );
}

function limitText(value: string, maxCharacters: number) {
  if (value.length <= maxCharacters) return value;
  return `${value.slice(0, Math.max(0, maxCharacters - 80)).trimEnd()}\n[Truncated to fit LM Studio context.]`;
}
