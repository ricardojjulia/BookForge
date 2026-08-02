import { criticLenses } from "@/lib/critic/prompts";
import { evaluateChapterSummaryQuality } from "@/lib/manuscript/summary-quality";
import type { RewriteWorkflowRow } from "@/lib/rewrite/workflows";

export type RewriteReadinessStatus = "ready" | "recommended" | "blocked" | "optional";

export type RewriteReadinessItem = {
  key: string;
  label: string;
  status: RewriteReadinessStatus;
  detail: string;
  actionLabel?: string;
  href?: string;
};

export type RewriteReadiness = {
  overallStatus: RewriteReadinessStatus;
  headline: string;
  blockingReasons: string[];
  recommendedReasons: string[];
  items: RewriteReadinessItem[];
  stepStatus: Record<number, RewriteReadinessStatus>;
  stepBlockers: Record<number, string[]>;
};

export function getRewriteReadiness(input: {
  bookId: string;
  hasBlueprint: boolean;
  hasRewritePlan: boolean;
  chapters: Array<{ title: string | null; summary: string | null; original_text?: string | null }>;
  criticReports: Array<{ report_type: string }>;
  latestRewriteJobId: string | null;
  pendingDraftParagraphCount: number;
  acceptedParagraphCount: number;
  untouchedParagraphCount: number;
  modelEvaluation?: Record<string, unknown> | null;
  latestDriftReportId?: string | null;
  workflow: RewriteWorkflowRow;
}): RewriteReadiness {
  const weakSummaries = input.chapters.filter(
    (chapter) =>
      evaluateChapterSummaryQuality({
        title: chapter.title,
        summary: chapter.summary,
        originalText: chapter.original_text,
      }).status === "review",
  ).length;
  const usableSummaries = input.chapters.length - weakSummaries;
  const criticDone = getCriticCoverage(input.criticReports);
  const criticTotal = Object.keys(criticLenses).length;
  const hasSample = Boolean(input.latestRewriteJobId || input.workflow.sample_revision_job_id);
  const hasReviewedSample = input.acceptedParagraphCount > 0;
  const strategyApproved = input.workflow.strategy_approved || Boolean(input.workflow.campaign_id);
  const hasDriftCheck = Boolean(input.latestDriftReportId || input.workflow.last_drift_report_id);
  const hasAcceptedRevisions = input.acceptedParagraphCount > 0;
  const modelEvaluation = parseModelEvaluation(input.modelEvaluation);
  const modelScore = modelEvaluation.score;

  const items: RewriteReadinessItem[] = [
    {
      key: "blueprint",
      label: "Manuscript Blueprint",
      status: input.hasBlueprint ? "ready" : "blocked",
      detail: input.hasBlueprint
        ? "Blueprint is available for context and guardrails."
        : "Generate the Manuscript Blueprint before trusting a full rewrite.",
      actionLabel: input.hasBlueprint ? undefined : "Generate Blueprint",
      href: input.hasBlueprint ? undefined : `/books/${input.bookId}`,
    },
    {
      key: "summaries",
      label: "Chapter Summary Quality",
      status: input.chapters.length > 0 && weakSummaries === 0 ? "ready" : usableSummaries > 0 ? "recommended" : "blocked",
      detail:
        input.chapters.length === 0
          ? "No chapters exist yet."
          : weakSummaries === 0
            ? `${usableSummaries}/${input.chapters.length} existing summaries look usable.`
            : `${weakSummaries} existing chapter summary/summaries are too thin/generic to be reliable rewrite context (separate from whether a summary exists at all — see the "Chapter summaries generated" card above).`,
      actionLabel: weakSummaries ? "Review Summaries" : undefined,
      href: weakSummaries ? `/books/${input.bookId}` : undefined,
    },
    {
      key: "critic",
      label: "BookForge Critic",
      status: criticDone >= criticTotal ? "ready" : criticDone >= 4 ? "recommended" : "blocked",
      detail:
        criticDone >= criticTotal
          ? `All ${criticTotal} Critic lenses have baseline coverage.`
          : `${criticDone}/${criticTotal} Critic lenses have run. More lenses produce a stronger rewrite plan.`,
      actionLabel: criticDone >= criticTotal ? undefined : "Run Critic",
      href: criticDone >= criticTotal ? undefined : `/books/${input.bookId}`,
    },
    {
      key: "rewrite_plan",
      label: "Rewrite Architect Plan",
      status: input.hasRewritePlan ? "ready" : "blocked",
      detail: input.hasRewritePlan
        ? "A saved plan is ready for coherent rewrite calls."
        : "Generate a Rewrite Architect plan before running rewrite batches.",
      actionLabel: input.hasRewritePlan ? undefined : "Generate Plan",
      href: input.hasRewritePlan ? undefined : `/books/${input.bookId}/rewrite-plan#planning-gate`,
    },
    {
      key: "model",
      label: "Rewrite Model Fit",
      status: modelEvaluation.usedForRewrite
        ? modelEvaluation.cloudModel
          ? "ready"
          : "blocked"
        : modelEvaluation.connected === false || modelEvaluation.available === false
          ? "blocked"
          : modelScore == null
            ? "recommended"
            : modelScore >= 80
              ? "ready"
              : modelScore >= 65
                ? "recommended"
                : "blocked",
      detail: modelEvaluation.usedForRewrite
        ? modelEvaluation.cloudModel
          ? `Full-book rewrite passes use ${modelEvaluation.cloudModel} via ${modelEvaluation.cloudProvider || "your configured cloud provider"} — LM Studio local suitability scoring doesn't apply.`
          : `No rewrite model configured for ${modelEvaluation.cloudProvider || "your cloud provider"}. Set one in Settings.`
        : modelEvaluation.connected === false
          ? "LM Studio was disconnected during the last model evaluation."
          : modelEvaluation.available === false
            ? `${modelEvaluation.model || "Configured rewrite model"} was not loaded in LM Studio.`
            : modelScore == null
          ? "Model suitability has not been evaluated for this workflow."
          : modelScore >= 80
            ? `${modelEvaluation.model || "Configured rewrite model"} meets the target at ${modelScore}%.`
            : `${modelEvaluation.model || "Configured rewrite model"} scored ${modelScore}%. BookForge prefers 80% or better.`,
      actionLabel: "Evaluate Models",
    },
    {
      key: "sample",
      label: "Sample Rewrite Batch",
      status: hasSample ? "ready" : input.hasRewritePlan ? "recommended" : "blocked",
      detail: hasSample
        ? "At least one rewrite job exists for review."
        : "Run a small spread batch before committing to the full direction.",
    },
    {
      key: "sample_review",
      label: "Sample Review",
      status: hasReviewedSample ? "ready" : pendingReviewStatus(input.pendingDraftParagraphCount),
      detail: hasReviewedSample
        ? `${input.acceptedParagraphCount} accepted paragraph revision(s) confirm the direction.`
        : input.pendingDraftParagraphCount > 0
          ? `${input.pendingDraftParagraphCount} draft revision(s) need human review before approving the strategy.`
          : "No draft revisions are ready for review yet.",
      actionLabel: input.pendingDraftParagraphCount > 0 ? "Review Drafts" : undefined,
      href: input.pendingDraftParagraphCount > 0 ? `/books/${input.bookId}/revisions` : undefined,
    },
    {
      key: "strategy",
      label: "Approved Strategy",
      status: strategyApproved ? "ready" : hasReviewedSample ? "recommended" : "blocked",
      detail: strategyApproved
        ? "The selected settings have been approved for ongoing batches."
        : "Approve the strategy only after sample drafts feel right.",
    },
    {
      key: "coverage",
      label: "Full Spread Coverage",
      status: input.untouchedParagraphCount === 0 ? "ready" : strategyApproved ? "recommended" : "blocked",
      detail:
        input.untouchedParagraphCount === 0
          ? "Every eligible paragraph has rewrite coverage."
          : `${input.untouchedParagraphCount} paragraph(s) still have no rewrite draft.`,
    },
    {
      key: "drift",
      label: "Post-Rewrite Drift Check",
      status: hasDriftCheck ? "ready" : input.untouchedParagraphCount === 0 ? "recommended" : "optional",
      detail: hasDriftCheck
        ? "A drift check has been saved."
        : "Run drift and post-rewrite Critic checks before final export.",
    },
    {
      key: "export",
      label: "Final Export",
      status: hasAcceptedRevisions && hasDriftCheck ? "ready" : hasAcceptedRevisions ? "recommended" : "blocked",
      detail: hasAcceptedRevisions
        ? "Accepted revisions exist for final manuscript assembly."
        : "Accept revisions before building the final manuscript.",
      actionLabel: hasAcceptedRevisions ? "Open Final Builder" : undefined,
      href: hasAcceptedRevisions ? `/books/${input.bookId}/final-manuscript` : undefined,
    },
  ];

  const blockingReasons = items.filter((item) => item.status === "blocked").map((item) => `${item.label}: ${item.detail}`);
  const recommendedReasons = items.filter((item) => item.status === "recommended").map((item) => `${item.label}: ${item.detail}`);
  const overallStatus: RewriteReadinessStatus = blockingReasons.length ? "blocked" : recommendedReasons.length ? "recommended" : "ready";

  return {
    overallStatus,
    headline:
      overallStatus === "ready"
        ? "Rewrite workflow is ready for the next major move."
        : overallStatus === "recommended"
          ? "Rewrite workflow can continue, but a few quality checks are recommended."
          : "Rewrite workflow has blockers that protect coherence.",
    blockingReasons,
    recommendedReasons,
    items,
    stepStatus: {
      1: worstStatus(items, ["blueprint", "summaries", "critic", "rewrite_plan", "model"]),
      2: itemStatus(items, "sample"),
      3: itemStatus(items, "sample_review"),
      4: itemStatus(items, "strategy"),
      5: itemStatus(items, "coverage"),
      6: itemStatus(items, "drift"),
      7: itemStatus(items, "export"),
    },
    stepBlockers: {
      1: blockedDetails(items, ["blueprint", "summaries", "critic", "rewrite_plan", "model"]),
      2: blockedDetails(items, ["blueprint", "summaries", "critic", "rewrite_plan", "model"]),
      3: blockedDetails(items, ["sample"]),
      4: blockedDetails(items, ["sample_review"]),
      5: blockedDetails(items, ["strategy"]),
      6: blockedDetails(items, ["coverage"]),
      7: blockedDetails(items, ["drift", "export"]),
    },
  };
}

function getCriticCoverage(reports: Array<{ report_type: string }>) {
  const seen = new Set<string>();
  Object.keys(criticLenses).forEach((lens) => {
    if (reports.some((report) => report.report_type === `critic:${lens}`)) seen.add(lens);
  });
  return seen.size;
}

function parseModelEvaluation(value: Record<string, unknown> | null | undefined) {
  const configured =
    value?.configuredRewriteModel && typeof value.configuredRewriteModel === "object"
      ? (value.configuredRewriteModel as Record<string, unknown>)
      : null;
  const score = typeof configured?.score === "number" && Number.isFinite(configured.score) ? configured.score : null;
  return {
    connected: typeof value?.connected === "boolean" ? value.connected : null,
    model: typeof configured?.model === "string" ? configured.model : "",
    available: typeof configured?.available === "boolean" ? configured.available : null,
    score,
    evaluatedAt: typeof value?.evaluatedAt === "string" ? value.evaluatedAt : "",
    usedForRewrite: typeof value?.usedForRewrite === "boolean" ? value.usedForRewrite : false,
    cloudProvider: typeof value?.cloudProvider === "string" ? value.cloudProvider : "",
    cloudModel: typeof value?.cloudModel === "string" ? value.cloudModel : "",
  };
}

function pendingReviewStatus(pendingDraftParagraphCount: number): RewriteReadinessStatus {
  if (pendingDraftParagraphCount > 0) return "recommended";
  return "blocked";
}

function itemStatus(items: RewriteReadinessItem[], key: string) {
  return items.find((item) => item.key === key)?.status || "optional";
}

function worstStatus(items: RewriteReadinessItem[], keys: string[]): RewriteReadinessStatus {
  const statuses = keys.map((key) => itemStatus(items, key));
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("recommended")) return "recommended";
  if (statuses.includes("optional")) return "optional";
  return "ready";
}

function blockedDetails(items: RewriteReadinessItem[], keys: string[]) {
  return keys
    .map((key) => items.find((item) => item.key === key))
    .filter(isBlockedReadinessItem)
    .map((item) => `${item.label}: ${item.detail}`);
}

function isBlockedReadinessItem(item: RewriteReadinessItem | undefined): item is RewriteReadinessItem {
  return Boolean(item) && item?.status === "blocked";
}
