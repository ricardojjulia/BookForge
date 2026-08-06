import { criticLenses } from "@/lib/critic/prompts";
import type { CriticLens } from "@/lib/types";

export type CriticProgressReport = {
  report_type: string;
};

export const CRITIC_LENS_COUNT = Object.keys(criticLenses).length;

export function isCriticBaselineReportType(reportType: string): boolean {
  if (!reportType.startsWith("critic:")) return false;
  const lens = reportType.replace(/^critic:/, "");
  return lens in criticLenses;
}

export function isCriticPostReportType(reportType: string): boolean {
  if (!reportType.startsWith("critic_post:")) return false;
  const lens = reportType.replace(/^critic_post:/, "");
  return lens in criticLenses;
}

export function isCriticReportType(reportType: string): boolean {
  return isCriticBaselineReportType(reportType) || isCriticPostReportType(reportType);
}

export type CriticProgress = {
  baselineCount: number;
  postCount: number;
  totalLenses: number;
  baselineComplete: boolean;
  postComplete: boolean;
  missingBaselineLenses: CriticLens[];
  missingPostLenses: CriticLens[];
};

export function computeCriticProgress(reports: CriticProgressReport[]): CriticProgress {
  const baselineLenses = new Set<string>();
  const postLenses = new Set<string>();

  for (const report of reports) {
    const reportType = String(report.report_type).toLowerCase();
    if (isCriticBaselineReportType(reportType)) {
      baselineLenses.add(reportType.replace(/^critic:/, ""));
    } else if (isCriticPostReportType(reportType)) {
      postLenses.add(reportType.replace(/^critic_post:/, ""));
    }
  }

  const allLenses = Object.keys(criticLenses) as CriticLens[];
  const missingBaselineLenses = allLenses.filter((lens) => !baselineLenses.has(lens));
  const missingPostLenses = allLenses.filter((lens) => !postLenses.has(lens));

  return {
    baselineCount: baselineLenses.size,
    postCount: postLenses.size,
    totalLenses: CRITIC_LENS_COUNT,
    baselineComplete: missingBaselineLenses.length === 0,
    postComplete: missingPostLenses.length === 0,
    missingBaselineLenses,
    missingPostLenses,
  };
}
