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
  const chapterNote = firstReadableItem(content.chapterNotes);
  const voiceNote = firstReadableItem(content.voiceAndStyleNotes);
  const continuityFlag = firstReadableItem(content.continuityFlags);
  const nextStep = firstReadableItem(content.nextRevisionPlan);

  const sentences = [
    strongestStrength ? `Strength: ${strongestStrength}` : "",
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

  return "The model returned a score but did not provide readable findings. Recheck this lens to generate a fuller report.";
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
    stringValue(record.issueType) ||
    stringValue(record.area) ||
    stringValue(record.category) ||
    stringValue(record.focus);
  const detail =
    stringValue(record.recommendation) ||
    stringValue(record.suggestedFix) ||
    stringValue(record.description) ||
    stringValue(record.note) ||
    stringValue(record.reason) ||
    stringValue(record.observation);

  if (title && detail) return `${title}: ${detail}`;
  return title || detail;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
