export function extractCriticScore(content: Record<string, unknown> | null | undefined) {
  if (!content) return null;
  return normalizeScore(
    content.score ??
      content.overallScore ??
      content.overall_score ??
      content.rating ??
      content.grade,
  );
}

export function normalizeScore(value: unknown): number | null {
  if (typeof value === "number" || typeof value === "string") {
    return normalizeNumericScore(value);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const preferred = entries.find(([key]) => /overall|total|final|prose quality/i.test(key));
    const preferredScore = preferred ? normalizeNumericScore(preferred[1]) : null;
    if (preferredScore != null) return preferredScore;

    const scores = entries
      .map(([, item]) => normalizeNumericScore(item))
      .filter((item): item is number => typeof item === "number");

    if (scores.length) {
      return Math.round(scores.reduce((sum, item) => sum + item, 0) / scores.length);
    }
  }

  return null;
}

function normalizeNumericScore(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= 10) return Math.round(numeric * 10);
  return Math.round(Math.max(0, Math.min(100, numeric)));
}
