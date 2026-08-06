import { Badge, Button, Group, Paper, Progress, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { AutoReviewWizard } from "@/components/books/auto-review/auto-review-wizard";
import { CRITIC_LENS_COUNT } from "@/lib/critic/progress";
import type { RewriteReadiness } from "@/lib/rewrite/readiness";

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

  return (
    <Paper withBorder radius="md" p="lg" bg="#fffdf8" mb="xl">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs" mb={6}>
              <Badge color={stageColor} variant="light">
                {stage}
              </Badge>
              <Badge color={hasDriftReport ? "green" : "yellow"} variant="light">
                Drift {hasDriftReport ? "checked" : "needed"}
              </Badge>
              <Badge color={postCriticCount >= CRITIC_LENS_COUNT ? "green" : "yellow"} variant="light">
                Post-Critic {postCriticCount}/{CRITIC_LENS_COUNT}
              </Badge>
            </Group>
            <Title order={3}>Production Command Center</Title>
            <Text c="dimmed" size="sm">
              {guidance}
            </Text>
          </div>
          <Group gap="xs" align="flex-start">
            {showDirectAutoReviewCta ? (
              <AutoReviewWizard bookId={bookId} bookTitle={bookTitle} />
            ) : (
              <Link href={actionHref} style={{ textDecoration: "none" }}>
                <Button color="grape">{actionLabel}</Button>
              </Link>
            )}
          </Group>
        </Group>

        <div>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={800}>
              Accepted manuscript coverage
            </Text>
            <Text size="sm" c="dimmed">
              {acceptedParagraphs.toLocaleString()} / {totalParagraphs.toLocaleString()} paragraphs
            </Text>
          </Group>
          <Progress value={acceptedPercent} color={acceptedPercent >= 90 ? "green" : acceptedPercent >= 50 ? "yellow" : "grape"} radius="xl" />
          {pendingDrafts > 0 ? (
            <Text size="xs" c="dimmed" mt={4}>
              {acceptedPercent}% accepted ·{" "}
              <Link href={pendingDraftHref} style={{ color: "inherit", textDecoration: "underline" }}>
                {pendingDrafts.toLocaleString()} paragraph(s) with pending drafts
                {pendingDraftRevisions > pendingDrafts
                  ? ` (${pendingDraftRevisions.toLocaleString()} total pending draft revision version(s))`
                  : ""}
              </Link>
            </Text>
          ) : (
            <Text size="xs" c="dimmed" mt={4}>
              {acceptedPercent}% accepted · {pendingDrafts.toLocaleString()} paragraph(s) with pending drafts
              {pendingDraftRevisions > pendingDrafts
                ? ` (${pendingDraftRevisions.toLocaleString()} total pending draft revision version(s))`
                : ""}
            </Text>
          )}
        </div>
      </Stack>
    </Paper>
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
      guidance: "Your draft is ready. Run Auto-Review to analyze it, get critic feedback, and start improving — it generates the Blueprint automatically as its first step.",
      actionLabel: "Run Auto-Review",
      actionHref: `/books/${input.bookId}/studio`,
    };
  }

  if (!input.hasRewritePlan || !input.rewriteWorkflowStarted) {
    return {
      stage: "Ready to rewrite",
      stageColor: "grape",
      guidance: "Blueprint is in place. Run Auto-Review to generate a rewrite plan and begin improving the manuscript.",
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
