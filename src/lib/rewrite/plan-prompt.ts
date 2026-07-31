import { criticLenses } from "@/lib/critic/prompts";
import { extractCriticScore } from "@/lib/critic/score";
import { describeDialogueDensity } from "@/lib/dialogue-density";
import type { CriticLens } from "@/lib/types";

type RewritePlanPromptInput = {
  title: string;
  genre?: string | null;
  targetAudience?: string | null;
  dialogDensity?: string | null;
  manuscriptBlueprint?: unknown;
  rewriteModelSelection?: unknown;
  chapters: Array<{ chapter_number: number; title: string | null; summary: string | null }>;
  criticReports: Array<{ report_type: string; created_at: string; content: Record<string, unknown> | null }>;
  promptCharBudget?: number;
};

export function buildRewritePlanPrompt(input: RewritePlanPromptInput) {
  const latestCritics = getLatestCritics(input.criticReports);
  const budget = splitPromptBudget(input.promptCharBudget || 32000);

  return `You are BookForge Rewrite Architect.

Create a structured plan for an LM Studio-powered full-book rewrite. This is a planning task only. Do not rewrite the manuscript yet.

The rewrite system must improve the entire book while preserving coherence from beginning to end.

BOOK:
${input.title}

GENRE:
${input.genre || "Not specified"}

TARGET AUDIENCE:
${input.targetAudience || "Not specified"}

DIALOGUE DENSITY:
${describeDialogueDensity(input.dialogDensity)}

MANUSCRIPT BLUEPRINT:
${compactJson(input.manuscriptBlueprint || {}, budget.blueprint)}

CHAPTER MAP:
${input.chapters
  .map((chapter) => `${chapter.chapter_number}. ${chapter.title || "Untitled"}: ${truncateText(chapter.summary || "No summary yet.", budget.chapterSummary)}`)
  .join("\n")}

LATEST CRITIC SCORES AND FINDINGS:
${compactJson(latestCritics, budget.critics)}

LM STUDIO REWRITE MODEL SELECTION:
${compactJson(input.rewriteModelSelection || {}, budget.modelSelection)}

Return only valid JSON. Do not use markdown fences. Do not include comments.

Return JSON with:
{
  "rewriteObjective": "",
  "contextContinuityMandate": "",
  "globalGuardrails": [],
  "coherenceContract": {
    "voiceRules": [],
    "characterPermanenceRules": [],
    "timelineRules": [],
    "motifRules": [],
    "contemporaryViewRules": [],
    "contextWindowRules": [],
    "driftPreventionRules": [],
    "forbiddenChanges": []
  },
  "contextPacketRequiredForEveryRewriteCall": {
    "globalObjective": true,
    "manuscriptBlueprint": true,
    "criticPriorities": true,
    "chapterSummary": true,
    "previousChapterSummary": true,
    "nextChapterSummary": true,
    "characterStateAtThisPoint": true,
    "timelineStateAtThisPoint": true,
    "motifsBeforeAndAfter": true,
    "lockedPassages": true,
    "acceptedPriorRevisions": true,
    "continuityWarnings": true
  },
  "continuityLedger": {
    "trackedEntities": [],
    "trackedRelationships": [],
    "trackedTimelineFacts": [],
    "trackedMotifs": [],
    "trackedWorldviewConstraints": [],
    "updateAfterEachUnit": true
  },
  "executionStrategy": {
    "unitOfWork": "scene | chapter | paragraph",
    "selectedRewriteModel": "",
    "selectedRewriteModelSuitability": 0,
    "modelSuitabilityWarning": "",
    "recommendedBatchSize": 1,
    "contextPackagePerCall": [],
    "whyThisIsEfficient": "",
    "estimatedRewriteCalls": 0
  },
  "unitRewriteProtocol": [
    "Load global rewrite objective and coherence contract.",
    "Load previous/current/next chapter summaries.",
    "Load current continuity ledger.",
    "Rewrite only the assigned unit.",
    "Return revised text plus continuity changes and warnings.",
    "Run drift check before saving as a revision version."
  ],
  "phases": [
    {
      "phase": 1,
      "name": "",
      "purpose": "",
      "aiModelType": "reasoning | rewrite | extraction",
      "unitStrategy": "summaries | chapters | scenes | paragraphs",
      "actions": [],
      "outputs": [],
      "continuityCheck": "",
      "qualityGate": ""
    }
  ],
  "chapterRewriteDirectives": [
    {
      "chapterNumber": 1,
      "chapterTitle": "",
      "primaryGoal": "",
      "preserve": [],
      "improve": [],
      "contextNeeded": [],
      "continuityDependencies": [],
      "riskFlags": []
    }
  ],
  "driftChecks": [],
  "betweenPhaseValidation": [],
  "postRewriteCriticPasses": [
    "story_structure",
    "prose_quality",
    "continuity",
    "character_depth",
    "market_fit",
    "contemporary_view",
    "revision_priorities",
    "dialogue_density"
  ],
  "acceptanceCriteria": []
}

Rules:
- Plan for many smaller calls instead of one big rewrite call.
- The AI must always know the global objective, coherence contract, chapter context, nearby chapter summaries, critic priorities, and locked passage rules.
- Use the LM Studio rewrite model selection above when naming the selectedRewriteModel and model suitability warning.
- If the best available rewrite model is below 80% suitability, the plan must warn the user and recommend smaller units, more validation, or loading a stronger model.
- Preserve character permanence: do not rename characters, merge people, alter relationships, or change backstory unless explicitly requested.
- Preserve authorial voice and emotional/theological meaning.
- Prevent drift: each unit rewrite must reference the same global rewrite objective and Manuscript Blueprint.
- Treat context, continuity, and coherence as primary constraints, not optional polish.
- Every unit rewrite call must include previous context, current unit context, next context, the continuity ledger, and exact instructions for what must not change.
- After each unit, update the continuity ledger before the next rewrite call.
- If a rewrite would improve prose but damage coherence, the plan must reject that rewrite and preserve coherence.
- Add validation checkpoints after each phase and before the final manuscript build.
- Include a final phase that reruns all BookForge Critic lenses after the rewrite.
- The user remains in control: revisions must be saved as versions and accepted/rejected by the author.`;
}

function getLatestCritics(reports: RewritePlanPromptInput["criticReports"]) {
  const map = new Map<CriticLens, Record<string, unknown>>();

  for (const report of reports) {
    const lens = report.report_type.replace(/^critic:/, "") as CriticLens;
    if (!(lens in criticLenses) || map.has(lens)) continue;
    const content = report.content || {};
    map.set(lens, {
      lens,
      label: criticLenses[lens].label,
      score: extractCriticScore(report.content),
      executiveSummary: stringValue(content.executiveSummary),
      strengths: compactArray(content.strengths, 4),
      risks: compactArray(content.risks, 5),
      highestLeverageFixes: compactArray(content.highestLeverageFixes, 6),
      continuityFlags: compactArray(content.continuityFlags, 5),
      nextRevisionPlan: compactArray(content.nextRevisionPlan, 5),
      createdAt: report.created_at,
    });
  }

  return Array.from(map.values());
}

function compactJson(value: unknown, maxChars: number) {
  return truncateText(JSON.stringify(value, null, 2), maxChars);
}

function truncateText(value: unknown, maxChars: number) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}\n...[truncated for local model context]`;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? truncateText(value, 1400) : "";
}

function compactArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => {
    if (typeof item === "string") return truncateText(item, 900);
    if (!item || typeof item !== "object") return item;

    const record = item as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record)
        .slice(0, 8)
        .map(([key, itemValue]) => [key, typeof itemValue === "string" ? truncateText(itemValue, 700) : itemValue]),
    );
  });
}

function splitPromptBudget(total: number) {
  const safeTotal = Math.max(10000, total);
  return {
    blueprint: Math.max(3000, Math.floor(safeTotal * 0.28)),
    critics: Math.max(4000, Math.floor(safeTotal * 0.34)),
    modelSelection: Math.max(1200, Math.floor(safeTotal * 0.08)),
    chapterSummary: safeTotal < 22000 ? 420 : 700,
  };
}
