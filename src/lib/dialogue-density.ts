export const DIALOG_DENSITY_LEVELS = ["low", "normal", "above_normal", "high"] as const;

export type DialogDensity = (typeof DIALOG_DENSITY_LEVELS)[number];

export const DIALOG_DENSITY_LABELS: Record<DialogDensity, string> = {
  low: "Low",
  normal: "Normal",
  above_normal: "Above Normal",
  high: "High",
};

export const DIALOG_DENSITY_GUIDANCE: Record<DialogDensity, string> = {
  low: "Keep dialogue sparse (roughly under 15% of the prose). Favor narration, introspection, and description; reserve spoken dialogue for pivotal, high-stakes moments.",
  normal:
    "Use a balanced mix of dialogue and narration (roughly 15-30% of the prose as dialogue). Let conversation carry characterization and pacing without dominating scenes.",
  above_normal:
    "Favor dialogue-forward scenes (roughly 30-45% of the prose as dialogue). Let characters talk through conflict, exposition, and relationship beats more than the narrator does.",
  high: "Make dialogue the primary engine of scenes (roughly 45%+ of the prose as dialogue). Minimize narrative exposition; let voice and exchange carry the story.",
};

export function toDialogDensity(value: string | null | undefined): DialogDensity {
  return (DIALOG_DENSITY_LEVELS as readonly string[]).includes(value || "")
    ? (value as DialogDensity)
    : "normal";
}

export function describeDialogueDensity(level: string | null | undefined): string {
  const key = toDialogDensity(level);
  return `${DIALOG_DENSITY_LABELS[key]} — ${DIALOG_DENSITY_GUIDANCE[key]}`;
}

// Straight/curly double quotes cover English and many other languages, but
// literary Spanish, French, and Italian conventionally render dialogue with
// guillemets (« ») for the whole exchange and/or an em/en dash starting each
// speaker's line instead of quotation marks -- counting only quotes silently
// scored those manuscripts as having near-zero dialogue.
function extractDialogueSegments(text: string): string[] {
  const quoted = text.match(/["“][^"”]{1,4000}["”]/g) || [];
  const guillemets = text.match(/«[^»]{1,4000}»/g) || [];
  const dashLines = text.match(/^[ \t]*[—–][^\n]+$/gm) || [];
  return [...quoted, ...guillemets, ...dashLines];
}

export function computeDialogueRatio(text: string): { dialogueWords: number; totalWords: number; ratio: number } {
  const dialogueMatches = extractDialogueSegments(text);
  const totalWords = countWords(text);
  const dialogueWords = Math.min(totalWords, dialogueMatches.reduce((sum, match) => sum + countWords(match), 0));
  return { dialogueWords, totalWords, ratio: totalWords > 0 ? dialogueWords / totalWords : 0 };
}

function countWords(text: string) {
  return (text.match(/\S+/g) || []).length;
}
