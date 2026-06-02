import { jsonrepair } from "jsonrepair";

export type RewritePlanDefaultContext = {
  chapters?: Array<{ chapter_number: number; title: string | null; summary: string | null }>;
};

export function applyRewritePlanDefaults(
  plan: Record<string, unknown> | null | undefined,
  context: RewritePlanDefaultContext = {},
): Record<string, unknown> {
  const current = unwrapEmbeddedPlan(plan || {});
  return {
    ...current,
    rewriteObjective:
      stringValue(current.rewriteObjective) ||
      "Improve the full manuscript while preserving author voice, meaning, continuity, and coherence.",
    contextContinuityMandate:
      stringValue(current.contextContinuityMandate) ||
      "Every rewrite call must preserve whole-book context, continuity, character permanence, timeline logic, motifs, and worldview.",
    globalGuardrails: nonEmptyArray(current.globalGuardrails, [
      "Never overwrite original manuscript text.",
      "Rewrite only the assigned unit; do not rewrite neighboring context.",
      "Preserve author voice, language, emotional meaning, theological/philosophical meaning, and cultural context.",
      "Do not rename characters, merge characters, change relationships, or alter backstory unless explicitly requested.",
      "Do not change timeline facts, sequence of events, the ending, or major plot facts.",
      "Flag continuity concerns instead of silently changing facts.",
      "Save all output as draft revision versions for human review.",
    ]),
    coherenceContract: {
      voiceRules: nonEmptyArray(objectValue(current.coherenceContract).voiceRules, [
        "Preserve the author's natural cadence and emotional intent.",
        "Improve clarity and rhythm without making the prose generic.",
        "Keep powerful rough phrases when polish would flatten the voice.",
      ]),
      characterPermanenceRules: nonEmptyArray(objectValue(current.coherenceContract).characterPermanenceRules, [
        "Character names, identities, relationships, and backstory remain permanent.",
        "Do not invent new character history or remove existing emotional stakes.",
      ]),
      timelineRules: nonEmptyArray(objectValue(current.coherenceContract).timelineRules, [
        "Maintain event order and chapter-to-chapter causality.",
        "Do not compress, reorder, or skip life events unless explicitly instructed.",
      ]),
      motifRules: nonEmptyArray(objectValue(current.coherenceContract).motifRules, [
        "Preserve recurring images, symbols, and emotional echoes.",
        "Strengthen motifs only when they already exist or are implied by the manuscript.",
      ]),
      contemporaryViewRules: nonEmptyArray(objectValue(current.coherenceContract).contemporaryViewRules ?? objectValue(current.coherenceContract).theologyWorldviewRules, [
        "Do not remove or dilute stated theological, devotional, pastoral, or philosophical meaning.",
        "Avoid unwanted doctrinal framing, overstatement, or tone drift.",
      ]),
      contextWindowRules: nonEmptyArray(objectValue(current.coherenceContract).contextWindowRules, [
        "Prefer smaller rewrite units when model context or quality is uncertain.",
        "Each call receives global plan, chapter context, adjacent context, and continuity warnings.",
      ]),
      driftPreventionRules: nonEmptyArray(objectValue(current.coherenceContract).driftPreventionRules, [
        "Compare every rewritten unit against the Rewrite Architect objective.",
        "Reject improvements that damage coherence, continuity, or authorial intent.",
      ]),
      forbiddenChanges: nonEmptyArray(objectValue(current.coherenceContract).forbiddenChanges, [
        "No character renames.",
        "No changed ending.",
        "No invented major plot facts.",
        "No removed theological, cultural, emotional, or stylistic meaning.",
      ]),
    },
    contextPacketRequiredForEveryRewriteCall: {
      globalObjective: true,
      manuscriptBlueprint: true,
      criticPriorities: true,
      chapterSummary: true,
      previousChapterSummary: true,
      nextChapterSummary: true,
      characterStateAtThisPoint: true,
      timelineStateAtThisPoint: true,
      motifsBeforeAndAfter: true,
      lockedPassages: true,
      acceptedPriorRevisions: true,
      continuityWarnings: true,
      ...objectValue(current.contextPacketRequiredForEveryRewriteCall),
    },
    continuityLedger: {
      trackedEntities: nonEmptyArray(objectValue(current.continuityLedger).trackedEntities, [
        "characters",
        "relationships",
        "locations",
      ]),
      trackedRelationships: nonEmptyArray(objectValue(current.continuityLedger).trackedRelationships, [
        "family bonds",
        "friendships",
        "romantic or parental dynamics",
      ]),
      trackedTimelineFacts: nonEmptyArray(objectValue(current.continuityLedger).trackedTimelineFacts, [
        "chapter order",
        "life-stage sequence",
        "cause-and-effect events",
      ]),
      trackedMotifs: nonEmptyArray(objectValue(current.continuityLedger).trackedMotifs, [
        "recurring images",
        "symbolic objects",
        "thematic echoes",
      ]),
      trackedWorldviewConstraints: nonEmptyArray(objectValue(current.continuityLedger).trackedWorldviewConstraints, [
        "theological tone",
        "philosophical claims",
        "pastoral sensitivity",
      ]),
      updateAfterEachUnit: true,
      ...objectValue(current.continuityLedger),
    },
    unitRewriteProtocol: nonEmptyArray(current.unitRewriteProtocol, [
      "Load global rewrite objective and coherence contract.",
      "Load previous/current/next chapter summaries.",
      "Load current continuity ledger.",
      "Rewrite only the assigned unit.",
      "Return revised text plus continuity changes and warnings.",
      "Run drift check before saving as a revision version.",
    ]),
    driftChecks: nonEmptyArray(current.driftChecks, [
      "Does the rewritten unit still mean the same thing?",
      "Did any character, relationship, event, or worldview claim change?",
      "Does the paragraph still fit the previous and next context?",
      "Did polish flatten the author's voice?",
    ]),
    betweenPhaseValidation: nonEmptyArray(current.betweenPhaseValidation, [
      "Run continuity review before moving from draft rewrite to polish.",
      "Run voice preservation after substantial rewrite batches.",
      "Rerun all BookForge Critic lenses after rewrite completion.",
    ]),
    chapterRewriteDirectives: nonEmptyArray(
      current.chapterRewriteDirectives,
      buildChapterRewriteDirectiveFallbacks(context.chapters || []),
    ),
  };
}

function buildChapterRewriteDirectiveFallbacks(
  chapters: Array<{ chapter_number: number; title: string | null; summary: string | null }>,
) {
  if (!chapters.length) return [];

  return chapters.map((chapter) => ({
    chapterNumber: chapter.chapter_number,
    chapterTitle: chapter.title || `Chapter ${chapter.chapter_number}`,
    primaryGoal: chapter.summary
      ? `Improve this chapter's prose, clarity, and emotional force while preserving its documented role: ${chapter.summary}`
      : "Improve prose, clarity, and emotional force while preserving the chapter's existing facts and function.",
    preserve: [
      "Original meaning and emotional intent",
      "Author voice and manuscript language",
      "Timeline position and chapter-to-chapter continuity",
      "Character names, relationships, and worldview meaning",
    ],
    improve: [
      "Sentence rhythm",
      "Readability",
      "Specificity",
      "Transitions",
      "Emotional resonance",
    ],
    contextNeeded: [
      "Manuscript Blueprint",
      "Rewrite Architect objective",
      "Previous chapter summary",
      "Current chapter summary",
      "Next chapter summary",
      "Continuity ledger",
    ],
    continuityDependencies: [
      "Previous chapter events must still lead naturally into this chapter.",
      "This chapter must still set up the next chapter without contradiction.",
    ],
    riskFlags: [
      "Do not over-polish into generic prose.",
      "Do not change factual or theological meaning for style.",
    ],
  }));
}

function unwrapEmbeddedPlan(plan: Record<string, unknown>) {
  const rawObjective = typeof plan.rewriteObjective === "string" ? plan.rewriteObjective.trim() : "";
  if (!rawObjective || !looksLikeEmbeddedJson(rawObjective)) return plan;

  const parsed = parseEmbeddedJsonObject(rawObjective) || salvageEmbeddedPlan(rawObjective);
  if (!parsed) return plan;

  const metadata = { ...plan };
  delete metadata.rewriteObjective;
  return {
    ...parsed,
    ...metadata,
  };
}

function salvageEmbeddedPlan(value: string): Record<string, unknown> | null {
  const normalized = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
  const rewriteObjective = extractJsonStringField(normalized, "rewriteObjective");
  const contextContinuityMandate = extractJsonStringField(normalized, "contextContinuityMandate");

  if (!rewriteObjective && !contextContinuityMandate) return null;

  return {
    rewriteObjective,
    contextContinuityMandate,
  };
}

function extractJsonStringField(value: string, field: string) {
  const pattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s");
  const match = value.match(pattern);
  if (!match) return "";

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1].replace(/\\"/g, '"');
  }
}

function looksLikeEmbeddedJson(value: string) {
  return value.startsWith("{") || value.startsWith("```") || value.includes('"rewriteObjective"');
}

function parseEmbeddedJsonObject(value: string): Record<string, unknown> | null {
  const normalized = value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .trim();
  const withoutFence = normalized
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const fenced = withoutFence.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || extractObject(withoutFence);
  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    try {
      const parsed = JSON.parse(jsonrepair(candidate));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
}

function extractObject(value: string) {
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  return first >= 0 && last > first ? value.slice(first, last + 1) : "";
}

function nonEmptyArray(value: unknown, fallback: unknown[]) {
  return Array.isArray(value) && value.length ? value : fallback;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "";
}
