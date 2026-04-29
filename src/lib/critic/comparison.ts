import { criticLenses } from "@/lib/critic/prompts";
import { extractCriticScore } from "@/lib/critic/score";
import type { CriticLens } from "@/lib/types";

export type CriticComparableReport = {
  report_type: string;
  content: Record<string, unknown> | null;
};

export function buildCriticComparisons(reports: CriticComparableReport[]) {
  const baseline = new Map<CriticLens, CriticComparableReport>();
  const post = new Map<CriticLens, CriticComparableReport>();

  reports.forEach((report) => {
    const baselineLens = report.report_type.replace(/^critic:/, "") as CriticLens;
    const postLens = report.report_type.replace(/^critic_post:/, "") as CriticLens;
    if (report.report_type.startsWith("critic:") && baselineLens in criticLenses && !baseline.has(baselineLens)) {
      baseline.set(baselineLens, report);
    }
    if (report.report_type.startsWith("critic_post:") && postLens in criticLenses && !post.has(postLens)) {
      post.set(postLens, report);
    }
  });

  return (Object.keys(criticLenses) as CriticLens[]).map((lens) => {
    const before = extractCriticScore(baseline.get(lens)?.content);
    const after = extractCriticScore(post.get(lens)?.content);
    return {
      lens,
      before,
      after,
      delta: typeof before === "number" && typeof after === "number" ? after - before : null,
    };
  });
}

export function summarizeStrategyOutcome(reports: CriticComparableReport[]) {
  const comparisons = buildCriticComparisons(reports);
  const completed = comparisons.filter((item) => typeof item.delta === "number");
  const improvements = completed.filter((item) => Number(item.delta) > 0).sort((a, b) => Number(b.delta) - Number(a.delta));
  const regressions = completed.filter((item) => Number(item.delta) < 0).sort((a, b) => Number(a.delta) - Number(b.delta));
  const averageDelta = completed.length
    ? Math.round(completed.reduce((sum, item) => sum + Number(item.delta), 0) / completed.length)
    : null;

  let recommendation = "Run the post-rewrite quality checks to compare this strategy against the baseline.";
  if (completed.length) {
    if (regressions.some((item) => ["continuity", "theology_worldview"].includes(item.lens))) {
      recommendation = "Pause before expanding this strategy. Fix continuity or worldview regression before accepting more drafts.";
    } else if (regressions.length) {
      recommendation = "The strategy has benefits but also regressions. Adjust the preset settings before the next batch.";
    } else if (improvements.length >= 3) {
      recommendation = "This strategy is trending well. Continue with spread batches and keep checking drift.";
    } else {
      recommendation = "The strategy is stable but modest. Continue sample review or increase the batch only if the prose feels right.";
    }
  }

  return {
    comparisons,
    completedCount: completed.length,
    improvements,
    regressions,
    averageDelta,
    recommendation,
  };
}
