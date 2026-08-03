export const CRITIC_SUMMARY_FALLBACK =
  "Score was captured, but this report did not include readable findings. Recheck this lens to regenerate a fuller narrative.";

export function summarizeCriticContent(content: Record<string, unknown>) {
  const explicit =
    stringValue(content.executiveSummary) ||
    stringValue(content.summary) ||
    stringValue(content.overview) ||
    stringValue(content.assessment);
  if (explicit) return explicit;

  const strongestRisk = firstReadableItem(content.risks);
  const strongestFix = firstReadableItem(content.highestLeverageFixes) || firstReadableItem(content.recommendedFixes);
  const strongestStrength = firstReadableItem(content.strengths);
  const strongestFinding =
    firstReadableItem(content.findings) ||
    firstReadableItem(content.keyFindings) ||
    firstReadableItem(content.observations) ||
    firstReadableItem(content.issues);
  const chapterNote = firstReadableItem(content.chapterNotes);
  const voiceNote = firstReadableItem(content.voiceAndStyleNotes);
  // Critic lens prompts ask for continuityFlags/nextRevisionPlan, but this
  // same summarizer also runs on non-critic report types shown in the same
  // panel (e.g. rewrite_execution, whose continuity notes surfaced during
  // rewriting use continuityWarnings/nextStep instead) -- without also
  // checking those names, a report with real, readable findings fell back
  // to the generic "did not include readable findings" message, worded as
  // if it were specifically about a critic lens.
  const continuityFlag = firstReadableItem(content.continuityFlags) || firstReadableItem(content.continuityWarnings);
  const nextStep = firstReadableItem(content.nextRevisionPlan) || stringValue(content.nextStep);

  const sentences = [
    strongestStrength ? `Strength: ${strongestStrength}` : "",
    strongestFinding ? `Key finding: ${strongestFinding}` : "",
    strongestRisk ? `Primary concern: ${strongestRisk}` : "",
    strongestFix ? `Best next fix: ${strongestFix}` : "",
    chapterNote ? `Chapter note: ${chapterNote}` : "",
    voiceNote ? `Voice note: ${voiceNote}` : "",
    continuityFlag ? `Continuity note: ${continuityFlag}` : "",
    nextStep ? `Next step: ${nextStep}` : "",
  ].filter(Boolean);

  if (sentences.length) return sentences.slice(0, 3).join(" ");

  const raw = stringValue(content.rawModelResponse);
  if (raw) return raw.slice(0, 800);

  return CRITIC_SUMMARY_FALLBACK;
}

function firstReadableItem(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  for (const item of items) {
    const text = readableItem(item);
    if (text) return text;
  }
  return "";
}

function readableItem(item: unknown): string {
  if (typeof item === "string") return item.trim();
  if (!item || typeof item !== "object") return "";
  const record = item as Record<string, unknown>;
  const title =
    stringValue(record.fix) ||
    stringValue(record.title) ||
    stringValue(record.finding) ||
    stringValue(record.message) ||
    stringValue(record.issueType) ||
    stringValue(record.area) ||
    stringValue(record.category) ||
    stringValue(record.focus);
  const detail =
    stringValue(record.text) ||
    stringValue(record.details) ||
    stringValue(record.recommendation) ||
    stringValue(record.suggestedFix) ||
    stringValue(record.description) ||
    stringValue(record.note) ||
    stringValue(record.reason) ||
    stringValue(record.observation);

  if (!title && !detail) {
    return firstReadableItem(record.items) || firstReadableItem(record.points) || "";
  }

  if (title && detail) return `${title}: ${detail}`;
  return title || detail;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
