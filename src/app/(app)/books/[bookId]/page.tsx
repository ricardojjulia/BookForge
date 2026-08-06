import { Alert, Badge, Button, Container, Group, Paper, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import { ManuscriptSearch } from "@/components/books/manuscript-search";
import { VoiceCapturePanel } from "@/components/books/voice-capture-panel";
import { DeleteBookButton } from "@/components/books/delete-book-button";
import { LiveProcessBanner } from "@/components/books/jobs/live-process-banner";
import { CriticScoreboard } from "@/components/books/reports/critic-scoreboard";
import { GuidanceWorkflowPanel } from "@/components/books/guidance/guidance-workflow-panel";
import { AutoReviewWizard } from "@/components/books/auto-review/auto-review-wizard";
import { BookConceptPanel } from "@/components/books/book-concept-panel";
import { ArchitectureRoadmapPanel } from "@/components/books/architecture-roadmap-panel";
import { getBookCriticReports } from "@/lib/books/book-data";
import { getBookAuthorDisplay } from "@/lib/books/status";
import { computeCriticProgress, CRITIC_LENS_COUNT } from "@/lib/critic/progress";
import { getRewriteReadiness, type RewriteReadiness } from "@/lib/rewrite/readiness";
import type { RewriteWorkflowRow } from "@/lib/rewrite/workflows";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function BookDashboardPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase before opening a book.</Alert>
      </Container>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [
    { data: book, error },
    { data: chapters },
    { count: paragraphs },
    { data: bible },
    { data: reports },
    { count: acceptedParagraphs },
    { count: pendingDrafts },
    { data: pendingDraftRows },
    { data: latestRewriteJob },
    { data: rewriteWorkflow },
    { data: rewritePlan },
    { data: latestDriftReport },
    { data: creationProject },
  ] =
    await Promise.all([
      supabase.from("books").select("*").eq("id", bookId).single(),
      supabase
        .from("chapters")
        .select("id,chapter_number,title,summary,status,original_text,section_type,exclude_from_rewrite,exclude_from_export,structure_notes")
        .eq("book_id", bookId)
        .order("chapter_number"),
      supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase.from("book_bibles").select("content,updated_at,voice_profile").eq("book_id", bookId).maybeSingle(),
      getBookCriticReports(supabase, bookId).then((result) => ({ data: result.reports })),
      supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId).not("accepted_text", "is", null),
      supabase
        .from("revision_versions")
        .select("id", { count: "exact", head: true })
        .eq("book_id", bookId)
        .eq("accepted", false)
        .eq("rejected", false),
      supabase
        .from("revision_versions")
        .select("paragraph_id")
        .eq("book_id", bookId)
        .eq("accepted", false)
        .eq("rejected", false)
        .not("paragraph_id", "is", null),
      supabase
        .from("revision_jobs")
        .select("id,status,created_at,completed_at,settings")
        .eq("book_id", bookId)
        .eq("mode", "full_book_rewrite")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("rewrite_workflows")
        .select("*")
        .eq("book_id", bookId)
        .maybeSingle(),
      supabase
        .from("coherence_reports")
        .select("id")
        .eq("book_id", bookId)
        .eq("report_type", "rewrite_plan")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("coherence_reports")
        .select("id")
        .eq("book_id", bookId)
        .eq("report_type", "rewrite_drift_check")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("creation_projects")
        .select("id,working_title,genre,target_audience,language,target_pages,tone")
        .eq("created_book_id", bookId)
        .maybeSingle(),
    ]);

  const { data: creationPlanVersions } = creationProject
    ? await supabase
        .from("creation_plan_versions")
        .select("version_type,content,accepted")
        .eq("creation_project_id", creationProject.id)
        .in("version_type", ["concept", "architecture"])
        .eq("accepted", true)
        .order("created_at", { ascending: false })
    : { data: null };
  const acceptedConcept = creationPlanVersions?.find((v) => v.version_type === "concept")?.content as Record<string, unknown> | null | undefined;
  const acceptedArchitecture = creationPlanVersions?.find((v) => v.version_type === "architecture")?.content as Record<string, unknown> | null | undefined;
  const bookMetadata = book?.metadata && typeof book.metadata === "object" ? (book.metadata as Record<string, unknown>) : null;
  const creationSeed =
    bookMetadata?.creationSeed && typeof bookMetadata.creationSeed === "object"
      ? (bookMetadata.creationSeed as Record<string, unknown>)
      : null;
  const seededConcept =
    creationSeed?.acceptedConcept && typeof creationSeed.acceptedConcept === "object"
      ? (creationSeed.acceptedConcept as Record<string, unknown>)
      : null;
  const seededArchitecture =
    creationSeed?.acceptedArchitecture && typeof creationSeed.acceptedArchitecture === "object"
      ? (creationSeed.acceptedArchitecture as Record<string, unknown>)
      : null;
  const conceptToDisplay = acceptedConcept || seededConcept;
  const architectureToDisplay = acceptedArchitecture || seededArchitecture;
  const conceptSeedSource = acceptedConcept ? "creation-plan" : seededConcept ? "book-metadata" : null;
  const fallbackConceptProject = {
    working_title: book?.title || null,
    genre: book?.genre || null,
    target_audience: book?.target_audience || null,
    language: typeof creationSeed?.language === "string" ? creationSeed.language : null,
    target_pages: typeof creationSeed?.targetPages === "number" ? creationSeed.targetPages : null,
    tone: typeof creationSeed?.tone === "string" ? creationSeed.tone : null,
  };
  const conceptProjectToDisplay =
    (creationProject ?? fallbackConceptProject) as {
      working_title: string | null;
      genre: string | null;
      target_audience: string | null;
      language: string | null;
      target_pages: number | null;
      tone: string | null;
    };

  if (error || !book) {
    return (
      <Container>
        <Alert color="red">Book not found or you do not have access.</Alert>
      </Container>
    );
  }

  const dashboardReadiness =
    rewriteWorkflow && rewriteWorkflow.mode !== "chooser"
      ? getRewriteReadiness({
          bookId,
          hasBlueprint: Boolean(bible),
          hasRewritePlan: Boolean(rewritePlan),
          chapters: chapters || [],
          criticReports: reports || [],
          latestRewriteJobId: latestRewriteJob?.id || null,
          pendingDraftParagraphCount: 0,
          acceptedParagraphCount: acceptedParagraphs || 0,
          untouchedParagraphCount: Math.max(0, (paragraphs || 0) - (acceptedParagraphs || 0)),
          latestDriftReportId: latestDriftReport?.id || null,
          modelEvaluation: getSavedModelEvaluation((rewriteWorkflow as RewriteWorkflowRow).metadata),
          workflow: rewriteWorkflow as RewriteWorkflowRow,
        })
      : null;
  const plannedChapterCount =
    chapters?.filter(
      (chapter) =>
        chapter.status === "planned" ||
        /Draft text has not been generated yet\. This planned chapter shell was created from BookForge Creator architecture\./i.test(
          chapter.original_text || "",
        ),
    ).length || 0;
  const acceptedPercent = paragraphs ? Math.round(((acceptedParagraphs || 0) / paragraphs) * 100) : 0;
  const pendingDraftParagraphs = new Set(
    (pendingDraftRows || []).map((row) => row.paragraph_id).filter(Boolean),
  ).size;
  const postCriticCount = computeCriticProgress(reports || []).postCount;
  const commandCenter = getBookCommandCenter({
    bookId,
    status: book.status,
    hasBlueprint: Boolean(bible),
    hasRewritePlan: Boolean(rewritePlan),
    rewriteWorkflowStarted: Boolean(rewriteWorkflow && rewriteWorkflow.mode !== "chooser"),
    rewriteReadiness: dashboardReadiness,
    paragraphCount: paragraphs || 0,
    acceptedParagraphCount: acceptedParagraphs || 0,
    pendingDraftCount: pendingDraftParagraphs,
    plannedChapterCount,
    hasLatestRewriteJob: Boolean(latestRewriteJob),
    hasDriftReport: Boolean(latestDriftReport),
    postCriticCount,
  });

  return (
    <Container size="xl">
      <DataFreshnessBanner routeKey={`book:${bookId}:dashboard`} fetchedAt={new Date().toISOString()} label="Book dashboard data" />
      <LiveProcessBanner bookId={bookId} />
      <Group justify="space-between" mb="xl" align="flex-start">
        <div>
          <Group mb="xs">
            <Badge color="grape">{book.status}</Badge>
            <Badge color="teal" variant="light">
              {book.genre || "Manuscript"}
            </Badge>
          </Group>
          <Title>{book.title}</Title>
          <Text c="dimmed">
            {getBookAuthorDisplay(book)} · {book.point_of_view || "POV unset"} · {book.tense || "tense unset"}
          </Text>
        </div>
        <DeleteBookButton bookId={bookId} bookTitle={book.title} redirectTo="/dashboard" size="md" />
      </Group>

      <SimpleGrid cols={{ base: 1, md: 4 }} mb="xl">
        <Metric label="Chapters" value={chapters?.length || 0} />
        <Metric label="Paragraphs" value={paragraphs || 0} />
        <Metric label="Manuscript Blueprint" value={bible ? "Ready" : "Not generated"} />
        <Metric label="Critic reports" value={reports?.length || 0} />
      </SimpleGrid>

      {conceptToDisplay && (
        <BookConceptPanel
          creationProject={conceptProjectToDisplay}
          concept={conceptToDisplay}
          seedLocked
          seedSource={conceptSeedSource === "book-metadata" ? "book-metadata" : "creation-plan"}
        />
      )}

      {architectureToDisplay && (
        <ArchitectureRoadmapPanel
          bookId={bookId}
          architecture={architectureToDisplay}
          chapters={chapters || []}
          plannedChapterCount={plannedChapterCount}
        />
      )}

      <Paper withBorder radius="md" p="md" bg="white" mb="xl">
        <ManuscriptSearch bookId={bookId} />
      </Paper>

      <WorkflowCommandCenter
        bookId={bookId}
        bookTitle={book.title}
        stage={commandCenter.stage}
        stageColor={commandCenter.stageColor}
        guidance={commandCenter.guidance}
        actionLabel={commandCenter.actionLabel}
        actionHref={commandCenter.actionHref}
        acceptedPercent={acceptedPercent}
        acceptedParagraphs={acceptedParagraphs || 0}
        pendingDrafts={pendingDraftParagraphs}
        pendingDraftRevisions={pendingDrafts || 0}
        totalParagraphs={paragraphs || 0}
        postCriticCount={postCriticCount}
        hasDriftReport={Boolean(latestDriftReport)}
      />

      <CriticScoreboard reports={reports || []} />

      {rewriteWorkflow && rewriteWorkflow.mode !== "chooser" && (
        <Paper withBorder radius="md" p="lg" bg="#f8f0ff" mb="xl">
          <Group justify="space-between" align="center">
            <div>
              <Title order={3}>Resume Guided Rewrite</Title>
              <Text c="dimmed" size="sm">
                {rewriteWorkflow.mode === "wizard" ? `Wizard checkpoint ${rewriteWorkflow.current_step} of 7` : "Manual rewrite workflow"} ·
                updated {new Date(rewriteWorkflow.updated_at).toLocaleString()}
              </Text>
              {dashboardReadiness && (
                <Text c={dashboardReadiness.overallStatus === "blocked" ? "red" : "dimmed"} size="sm" mt={4}>
                  {dashboardReadiness.headline}
                </Text>
              )}
            </div>
            <Link href={`/books/${bookId}/critic-quality`} style={{ textDecoration: "none" }}>
              <Button color="grape">
                Continue Rewrite Workflow
              </Button>
            </Link>
          </Group>
        </Paper>
      )}

      <VoiceCapturePanel
        bookId={bookId}
        chapters={(chapters || []).map((c) => ({ id: c.id, chapter_number: c.chapter_number, title: c.title ?? null }))}
        existingProfile={(bible as { voice_profile?: unknown } | null)?.voice_profile as Record<string, unknown> | null}
      />

      <Paper withBorder radius="md" p="lg" bg="white" mt="xl">
        <Group justify="space-between" align="center">
          <div>
            <Title order={3}>Studio</Title>
            <Text c="dimmed" size="sm">
              Run Critic, generate drafts, launch Auto-Review, and manage AI jobs for this book.
            </Text>
          </div>
          <Link href={`/books/${bookId}/studio`} style={{ textDecoration: "none" }}>
            <Button color="grape" variant="light">Open Studio</Button>
          </Link>
        </Group>
      </Paper>

      <Paper withBorder radius="md" p="lg" bg="white" mt="xl">
        <Group justify="space-between" align="center">
          <div>
            <Title order={3}>Critic & Quality</Title>
            <Text c="dimmed" size="sm">
              Detailed critic reports, before/after comparisons, the post-run quality gate, and drift checks.
            </Text>
          </div>
          <Link href={`/books/${bookId}/critic-quality`} style={{ textDecoration: "none" }}>
            <Button color="grape" variant="light">Open Critic & Quality</Button>
          </Link>
        </Group>
      </Paper>

      <GuidanceWorkflowPanel bookId={bookId} reports={reports || []} />

      <Paper withBorder radius="md" p="lg" bg="white" mt="xl">
        <Group justify="space-between" align="center">
          <div>
            <Title order={3}>World Bible</Title>
            <Text c="dimmed" size="sm">
              Characters, locations, themes, motifs, timeline, and book-level inputs (metadata, style, author notes).
            </Text>
          </div>
          <Link href={`/books/${bookId}/world`} style={{ textDecoration: "none" }}>
            <Button color="grape" variant="light">Open World Bible</Button>
          </Link>
        </Group>
      </Paper>

    </Container>
  );
}

function WorkflowCommandCenter({
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
            <Link href={actionHref} style={{ textDecoration: "none" }}>
              <Button color="grape">{actionLabel}</Button>
            </Link>
            {showDirectAutoReviewCta && <AutoReviewWizard bookId={bookId} bookTitle={bookTitle} />}
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

function getBookCommandCenter(input: {
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
      actionLabel: "Generate Draft Chapters",
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Paper withBorder radius="md" p="lg" bg="white">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Title order={2}>{value}</Title>
    </Paper>
  );
}

function getSavedModelEvaluation(metadata: Record<string, unknown> | null) {
  const value = metadata?.modelEvaluation;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
