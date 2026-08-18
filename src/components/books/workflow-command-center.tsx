import { Button } from "@mantine/core";
import Link from "next/link";
import { AutoReviewWizard } from "@/components/books/auto-review/auto-review-wizard";
import { CRITIC_LENS_COUNT } from "@/lib/critic/progress";
import type { RewriteReadiness } from "@/lib/rewrite/readiness";

const PILL_TONES: Record<string, { bg: string; color: string }> = {
  green: { bg: "oklch(0.94 0.05 165)", color: "oklch(0.4 0.1 165)" },
  teal: { bg: "oklch(0.94 0.05 165)", color: "oklch(0.4 0.1 165)" },
  yellow: { bg: "oklch(0.95 0.06 45)", color: "oklch(0.5 0.12 45)" },
  red: { bg: "oklch(0.96 0.04 25)", color: "oklch(0.4 0.1 25)" },
  blue: { bg: "oklch(0.94 0.03 250)", color: "oklch(0.45 0.09 250)" },
  grape: { bg: "oklch(0.94 0.04 275)", color: "oklch(0.45 0.13 275)" },
};

function Pill({ label, tone }: { label: string; tone: string }) {
  const palette = PILL_TONES[tone] || { bg: "oklch(0.96 0.003 90)", color: "oklch(0.5 0.005 90)" };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        padding: "4px 10px",
        borderRadius: 6,
        background: palette.bg,
        color: palette.color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function WorkflowCommandCenter({
  bookId,
  bookTitle,
  stage,
  stageColor,
  guidance,
  actionLabel,
  actionHref,
  acceptedPercent,
  acceptedParagraphs,
  pendingDrafts,
  pendingDraftRevisions,
  totalParagraphs,
  postCriticCount,
  hasDriftReport,
}: {
  bookId: string;
  bookTitle: string;
  stage: string;
  stageColor: string;
  guidance: string;
  actionLabel: string;
  actionHref: string;
  acceptedPercent: number;
  acceptedParagraphs: number;
  pendingDrafts: number;
  pendingDraftRevisions: number;
  totalParagraphs: number;
  postCriticCount: number;
  hasDriftReport: boolean;
}) {
  const showDirectAutoReviewCta =
    actionLabel.toLowerCase().includes("auto-review") && actionHref.endsWith("/studio");
  const pendingDraftHref = `/books/${bookId}/revisions`;

  const progressColor = acceptedPercent >= 90 ? "oklch(0.65 0.13 165)" : acceptedPercent >= 50 ? "oklch(0.65 0.13 70)" : "oklch(0.5 0.16 275)";

  return (
    <div style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "24px 26px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Pill label={stage} tone={stageColor} />
            <Pill label={`Drift ${hasDriftReport ? "checked" : "needed"}`} tone={hasDriftReport ? "green" : "yellow"} />
            <Pill label={`Post-Critic ${postCriticCount}/${CRITIC_LENS_COUNT}`} tone={postCriticCount >= CRITIC_LENS_COUNT ? "green" : "yellow"} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "oklch(0.2 0.005 90)" }}>Production Command Center</div>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "oklch(0.5 0.005 90)" }}>{guidance}</p>
        </div>
        {showDirectAutoReviewCta ? (
          <AutoReviewWizard bookId={bookId} bookTitle={bookTitle} />
        ) : (
          <Link href={actionHref} style={{ textDecoration: "none" }}>
            <Button color="grape">{actionLabel}</Button>
          </Link>
        )}
      </div>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid oklch(0.94 0.003 90)" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "oklch(0.25 0.005 90)" }}>Accepted manuscript coverage</span>
          <span style={{ fontSize: 13, color: "oklch(0.5 0.005 90)" }}>
            {acceptedParagraphs.toLocaleString()} / {totalParagraphs.toLocaleString()} paragraphs
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 5, background: "oklch(0.94 0.003 90)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${acceptedPercent}%`, borderRadius: 5, background: progressColor }} />
        </div>
        {pendingDrafts > 0 ? (
          <div style={{ fontSize: 13, color: "oklch(0.55 0.005 90)", marginTop: 8 }}>
            {acceptedPercent}% accepted ·{" "}
            <Link href={pendingDraftHref} style={{ color: "inherit", textDecoration: "underline" }}>
              {pendingDrafts.toLocaleString()} paragraph(s) with pending drafts
              {pendingDraftRevisions > pendingDrafts
                ? ` (${pendingDraftRevisions.toLocaleString()} total pending draft revision version(s))`
                : ""}
            </Link>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "oklch(0.55 0.005 90)", marginTop: 8 }}>
            {acceptedPercent}% accepted · {pendingDrafts.toLocaleString()} paragraph(s) with pending drafts
            {pendingDraftRevisions > pendingDrafts
              ? ` (${pendingDraftRevisions.toLocaleString()} total pending draft revision version(s))`
              : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export function getBookCommandCenter(input: {
  bookId: string;
  status: string | null;
  hasBlueprint: boolean;
  hasRewritePlan: boolean;
  rewriteWorkflowStarted: boolean;
  rewriteReadiness: RewriteReadiness | null;
  paragraphCount: number;
  acceptedParagraphCount: number;
  pendingDraftCount: number;
  plannedChapterCount: number;
  hasLatestRewriteJob: boolean;
  hasDriftReport: boolean;
  postCriticCount: number;
}) {
  if (input.pendingDraftCount > 0) {
    return {
      stage: "Review",
      stageColor: "teal",
      guidance: `${input.pendingDraftCount.toLocaleString()} paragraph(s) have pending draft revisions waiting for accept/reject decisions.`,
      actionLabel: "Review Drafts",
      actionHref: `/books/${input.bookId}/revisions`,
    };
  }

  if (input.status === "exported") {
    return {
      stage: "Exported",
      stageColor: "green",
      guidance: "A final file has been exported. You can still revise, rerun quality checks, or create another export.",
      actionLabel: "Open Final Builder",
      actionHref: `/books/${input.bookId}/final-manuscript`,
    };
  }

  if (input.plannedChapterCount > 0 || ["planned", "generating"].includes(String(input.status || ""))) {
    return {
      stage: input.status === "generating" ? "Generating draft" : "Architecture planned",
      stageColor: "blue",
      guidance: `${input.plannedChapterCount.toLocaleString()} planned chapter shell(s) still need manuscript text before revision work can really begin. Open Studio Actions, click Generate Planned Draft, then confirm the AI Task Preflight by clicking Proceed.`,
      actionLabel: "Go to Generate Planned Draft",
      actionHref: `/books/${input.bookId}/studio`,
    };
  }

  if (!input.hasBlueprint) {
    return {
      stage: "Draft ready",
      stageColor: "blue",
      guidance: "Your draft is ready. Click Auto-Review Wizard to analyze it, get critic feedback, and start improving — it generates the Blueprint automatically as its first step.",
      actionLabel: "Run Auto-Review",
      actionHref: `/books/${input.bookId}/studio`,
    };
  }

  if (!input.hasRewritePlan || !input.rewriteWorkflowStarted) {
    return {
      stage: "Ready to rewrite",
      stageColor: "grape",
      guidance: "Blueprint is in place. Click Auto-Review Wizard to generate a rewrite plan and begin improving the manuscript.",
      actionLabel: "Run Auto-Review",
      actionHref: `/books/${input.bookId}/studio`,
    };
  }

  const pendingAction = input.rewriteReadiness?.items.find((item) => item.status === "blocked" && item.href) ||
    input.rewriteReadiness?.items.find((item) => item.status === "recommended" && item.href);
  if (pendingAction?.href && pendingAction.actionLabel) {
    const actionHref =
      pendingAction.href === `/books/${input.bookId}` ? `/books/${input.bookId}/studio` : pendingAction.href;
    return {
      stage: input.rewriteReadiness?.overallStatus === "blocked" ? "Blocked" : "Recommended",
      stageColor: input.rewriteReadiness?.overallStatus === "blocked" ? "red" : "yellow",
      guidance: `${pendingAction.label}: ${pendingAction.detail}`,
      actionLabel: pendingAction.actionLabel,
      actionHref,
    };
  }

  const acceptedPercent = input.paragraphCount ? Math.round((input.acceptedParagraphCount / input.paragraphCount) * 100) : 0;
  if (acceptedPercent >= 80 && (!input.hasDriftReport || input.postCriticCount < CRITIC_LENS_COUNT)) {
    return {
      stage: "Quality check",
      stageColor: "yellow",
      guidance: "Accepted coverage is strong enough to run final drift and post-rewrite Critic checks.",
      actionLabel: "Open Final Builder",
      actionHref: `/books/${input.bookId}/final-manuscript`,
    };
  }

  if (acceptedPercent >= 90 && input.hasDriftReport && input.postCriticCount >= CRITIC_LENS_COUNT) {
    return {
      stage: "Export ready",
      stageColor: "green",
      guidance: "Final checks are in place. Preview the accepted manuscript assembly and export the publishable file.",
      actionLabel: "Build Final Manuscript",
      actionHref: `/books/${input.bookId}/final-manuscript`,
    };
  }

  if (input.hasLatestRewriteJob) {
    return {
      stage: "Rewrite in progress",
      stageColor: "grape",
      guidance: "Continue the guided rewrite workflow, run the next safe batch when ready, and keep accepting reviewed drafts.",
      actionLabel: "Continue Rewrite",
      actionHref: `/books/${input.bookId}/critic-quality`,
    };
  }

  return {
    stage: "Manuscript ready",
    stageColor: "teal",
    guidance: "The manuscript is structured and ready for analysis, Critic passes, or a guided rewrite workflow.",
    actionLabel: "Open Studio Actions",
    actionHref: `/books/${input.bookId}/studio`,
  };
}
