export function buildRewriteDriftPrompt(input: {
  manuscriptBlueprint?: unknown;
  rewritePlan?: unknown;
  continuityLedger?: unknown;
  revisionSamples: Array<{
    chapterTitle: string;
    paragraphNumber: number | null;
    originalText: string;
    revisedText: string;
    notes: string | null;
  }>;
}) {
  return `You are BookForge AI's coherence and drift reviewer.

Your job is to evaluate a rewrite batch before the author accepts too much of it.

MANUSCRIPT BLUEPRINT:
${JSON.stringify(input.manuscriptBlueprint || {}, null, 2)}

REWRITE PLAN:
${JSON.stringify(input.rewritePlan || {}, null, 2)}

LATEST CONTINUITY LEDGER:
${JSON.stringify(input.continuityLedger || {}, null, 2)}

REWRITE SAMPLES:
${input.revisionSamples
  .map(
    (sample, index) => `Sample ${index + 1}
Chapter: ${sample.chapterTitle}
Paragraph: ${sample.paragraphNumber ?? "unknown"}
Original:
${sample.originalText}

Revised:
${sample.revisedText}

Revision notes:
${sample.notes || "None"}`,
  )
  .join("\n\n---\n\n")}

Return only valid JSON. Do not use markdown fences. Do not include comments.

Return:
{
  "overallDriftRisk": "low | medium | high | critical",
  "summary": "",
  "voiceDrift": [],
  "factDrift": [],
  "timelineDrift": [],
  "characterDrift": [],
  "motifDrift": [],
  "contemporaryViewDrift": [],
  "overExpansionWarnings": [],
  "recommendedActions": []
}

Rules:
- Do not rewrite the manuscript.
- Flag issues instead of fixing them silently.
- Be especially sensitive to changed meaning, changed theology/worldview, invented facts, changed endings, and generic prose.
- If the rewrite appears coherent, say so clearly and give low-risk confirmation.`;
}
