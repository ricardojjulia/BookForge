import { Alert, Button, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import { RewriteExecutionPanel } from "@/components/books/rewrite/rewrite-execution-panel";
import { RewriteApprovalPanel } from "@/components/books/rewrite/rewrite-approval-panel";
import { RewriteModelEvaluator } from "@/components/books/rewrite/rewrite-model-evaluator";
import { RewritePlanActions } from "@/components/books/rewrite/rewrite-plan-actions";
import { RewritePlanView } from "@/components/books/rewrite/rewrite-plan-view";
import { ResetRewriteButton } from "@/components/books/rewrite/reset-rewrite-button";
import { ReadinessStatusGrid } from "@/components/books/rewrite/readiness-status-grid";
import { PostRunQualityGate } from "@/components/books/rewrite/post-run-quality-gate";
import { CriticComparisonPanel } from "@/components/books/reports/critic-comparison-panel";
import { CriticReportsPanel } from "@/components/books/reports/critic-reports-panel";
import { DriftReportsPanel } from "@/components/books/reports/drift-reports-panel";
import { LiveProcessBanner } from "@/components/books/jobs/live-process-banner";
import { getBookCriticReports } from "@/lib/books/book-data";
import { criticLenses } from "@/lib/critic/prompts";
import { CRITIC_LENS_COUNT, computeCriticProgress } from "@/lib/critic/progress";
import { getRewriteCampaignStats, type RewriteCampaignRow } from "@/lib/rewrite/campaigns";
import { getRewriteCoverage } from "@/lib/rewrite/coverage";
import { getRewriteReadiness } from "@/lib/rewrite/readiness";
import { getExistingRevisionState, shouldSkipParagraph, type ExistingRevisionRow } from "@/lib/rewrite/eligibility";
import { getDefaultRewriteWorkflow, type RewriteWorkflowRow } from "@/lib/rewrite/workflows";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function RewritePlanPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase before opening rewrite planning.</Alert>
      </Container>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [
    { data: book, error: bookError },
    { data: chapters },
    { data: bible },
    { data: reports },
    { count: acceptedTextParagraphCount },
    { data: rewritePlan },
    { data: latestRewriteJob },
    { count: paragraphCount },
    { data: revisionStateRows },
    { data: paragraphCoverageRows },
    { data: revisionCoverageRows },
    { data: activeCampaign },
    { data: recentRewriteJobs },
    { data: latestDriftReport },
    { data: workflow },
    { data: collaborators },
    { data: currentUserData },
  ] = await Promise.all([
    supabase.from("books").select("title,genre,target_audience").eq("id", bookId).single(),
    supabase.from("chapters").select("id,chapter_number,title,summary,original_text,exclude_from_rewrite").eq("book_id", bookId).order("chapter_number"),
    supabase
      .from("book_bibles")
      .select("content,updated_at")
      .eq("book_id", bookId)
      .maybeSingle(),
    getBookCriticReports(supabase, bookId).then((result) => ({ data: result.reports })),
    supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId).not("accepted_text", "is", null),
    supabase
      .from("coherence_reports")
      .select("content,created_at")
      .eq("book_id", bookId)
      .eq("report_type", "rewrite_plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("revision_jobs")
      .select("id,status,created_at,completed_at,settings")
      .eq("book_id", bookId)
      .eq("mode", "full_book_rewrite")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId),
    supabase
      .from("revision_versions")
      .select("paragraph_id,accepted,rejected")
      .eq("book_id", bookId)
      .not("paragraph_id", "is", null),
      supabase
        .from("paragraphs")
        .select("id,chapter_id,original_text,is_locked")
        .eq("book_id", bookId),
      supabase
        .from("revision_versions")
        .select("paragraph_id")
        .eq("book_id", bookId)
        .not("paragraph_id", "is", null),
      supabase
        .from("rewrite_campaigns")
        .select("*")
        .eq("book_id", bookId)
        .in("status", ["active", "running", "paused", "failed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("revision_jobs")
        .select("id,status,settings,error_message,created_at,started_at,completed_at")
        .eq("book_id", bookId)
        .eq("mode", "full_book_rewrite")
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("coherence_reports")
        .select("id,content,created_at")
        .eq("book_id", bookId)
        .eq("report_type", "rewrite_drift_check")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("rewrite_workflows")
        .select("*")
        .eq("book_id", bookId)
        .maybeSingle(),
      supabase
        .from("book_collaborators")
        .select("user_id,role,profiles(display_name,email)")
        .eq("book_id", bookId)
        .in("role", ["editor", "admin"]),
      supabase.auth.getUser(),
  ]);

  if (bookError || !book) {
    return (
      <Container>
        <Alert color="red">Book not found or you do not have access.</Alert>
      </Container>
    );
  }

  const criticCoverage = getCriticCoverage(reports || []);
  const summarized = (chapters || []).filter((chapter) => chapter.summary).length;
  const chapterCount = chapters?.length || 0;
  const { pendingDraftParagraphIds, acceptedParagraphIds } = getExistingRevisionState(
    (revisionStateRows || []) as ExistingRevisionRow[],
  );
  const pendingDraftParagraphCount = pendingDraftParagraphIds.size;
  const acceptedParagraphCount = acceptedParagraphIds.size;
  // A raw "paragraphCount minus touched" count includes paragraphs that will
  // NEVER become eligible -- locked, in an exclude_from_rewrite chapter, or
  // caught by the same shouldSkipParagraph filter rewrite-execute applies
  // (too short / echoes the chapter title). Without excluding these, the
  // displayed "remaining" count (and the button it gates) never reaches
  // zero even after every real paragraph has been rewritten, since the
  // server keeps finding 0 eligible units among the permanently-skipped
  // ones -- an infinite, misleading treadmill.
  const chapterById = new Map((chapters || []).map((chapter) => [chapter.id, chapter]));
  const permanentlyIneligibleUntouchedCount = ((paragraphCoverageRows || []) as Array<{
    id: string;
    chapter_id: string;
    original_text: string | null;
    is_locked: boolean | null;
  }>).filter((paragraph) => {
    if (pendingDraftParagraphIds.has(paragraph.id) || acceptedParagraphIds.has(paragraph.id)) return false;
    if (paragraph.is_locked) return true;
    const chapter = chapterById.get(paragraph.chapter_id) as { title?: string | null; exclude_from_rewrite?: boolean | null } | undefined;
    if (chapter?.exclude_from_rewrite) return true;
    return shouldSkipParagraph(paragraph.original_text || "", chapter?.title || null);
  }).length;
  const untouchedParagraphCount = Math.max(
    0,
    (paragraphCount || 0) - pendingDraftParagraphCount - acceptedParagraphCount - permanentlyIneligibleUntouchedCount,
  );
  const rewriteCoverage = getRewriteCoverage(chapters || [], paragraphCoverageRows || [], revisionCoverageRows || [], acceptedParagraphIds);
  const campaignStats = getRewriteCampaignStats({
    paragraphCount: paragraphCount || 0,
    pendingDraftParagraphCount,
    acceptedParagraphCount,
    rewriteCoverage,
  });
  const workflowState = (workflow as RewriteWorkflowRow | null) || getDefaultRewriteWorkflow(bookId);
  const reviewerOptions = ((collaborators || []) as Array<{ user_id: string; profiles?: { display_name?: string | null; email?: string | null } | null }>)
    .map((row) => ({
      value: row.user_id,
      label: row.profiles?.display_name || row.profiles?.email || row.user_id,
    }));
  const currentUserId = currentUserData?.user?.id || null;
  const readiness = getRewriteReadiness({
    bookId,
    hasBlueprint: Boolean(bible),
    hasRewritePlan: Boolean(rewritePlan),
    chapters: chapters || [],
    criticReports: reports || [],
    latestRewriteJobId: latestRewriteJob?.id || null,
    pendingDraftParagraphCount,
    acceptedParagraphCount,
    untouchedParagraphCount,
    latestDriftReportId: latestDriftReport?.id || null,
    modelEvaluation: getSavedModelEvaluation(workflowState.metadata),
    workflow: workflowState,
  });

  return (
    <Container size="xl">
      <DataFreshnessBanner routeKey={`book:${bookId}:critic-quality`} fetchedAt={new Date().toISOString()} label="Critic & quality data" />
      <LiveProcessBanner bookId={bookId} />
      <Group justify="space-between" mb="xl" align="flex-start">
        <div>
          <Title>Critic & Quality</Title>
          <Text c="dimmed">
            Rewrite Architect · {book.title} · {book.genre || "Genre unset"} · {book.target_audience || "Audience unset"}
          </Text>
        </div>
        <ResetRewriteButton bookId={bookId} />
      </Group>

      <div id="readiness-status">
        <ReadinessStatusGrid
          bookId={bookId}
          summarized={summarized}
          chapterCount={chapterCount}
          hasBlueprint={Boolean(bible)}
          criticDone={criticCoverage.done}
          criticTotal={CRITIC_LENS_COUNT}
          hasRewritePlan={Boolean(rewritePlan)}
        />
      </div>

      <RewriteModelEvaluator bookId={bookId} />

      <Paper id="planning-gate" withBorder radius="md" p="xl" bg="white" mb="xl">
        <Stack>
          <Title order={2}>Planning Gate</Title>
          <Text c="dimmed">
            The rewrite plan uses summaries, the Manuscript Blueprint, and Critic results to build a coherent multi-phase
            strategy before any prose is rewritten.
          </Text>
          {criticCoverage.missing.length > 0 && (
            <Alert color="yellow">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Text size="sm">
                  Missing critic lenses: {criticCoverage.missing.map((lens) => criticLenses[lens].label).join(", ")}.
                  You can generate a plan now, but the strongest plan comes after all {CRITIC_LENS_COUNT} lenses have
                  been run.
                </Text>
                <Button
                  component="a"
                  href="#readiness-status"
                  size="xs"
                  variant="filled"
                  color="yellow"
                  style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  Run missing critics ↑
                </Button>
              </Group>
            </Alert>
          )}
          <RewritePlanActions bookId={bookId} latestPlan={(rewritePlan?.content as Record<string, unknown> | null) || null} />
        </Stack>
      </Paper>

      <RewritePlanView
        content={(rewritePlan?.content as Record<string, unknown> | null) || null}
        chapters={chapters || []}
      />

      <RewriteApprovalPanel
        bookId={bookId}
        reviewerId={workflowState.reviewer_id || null}
        reviewStatus={workflowState.review_status || "unassigned"}
        reviewerOptions={reviewerOptions}
        currentUserId={currentUserId}
      />

      <RewriteExecutionPanel
        bookId={bookId}
        hasPlan={Boolean(rewritePlan)}
        paragraphCount={paragraphCount || 0}
        pendingDraftParagraphCount={pendingDraftParagraphCount}
        acceptedParagraphCount={acceptedParagraphCount}
        untouchedParagraphCount={untouchedParagraphCount}
        rewriteCoverage={rewriteCoverage}
        activeCampaign={(activeCampaign as RewriteCampaignRow | null) || null}
        campaignStats={campaignStats}
        campaignJobs={(recentRewriteJobs || []).filter((job) => {
          const campaignId = (job.settings as { campaignId?: unknown } | null)?.campaignId;
          return activeCampaign?.id && campaignId === activeCampaign.id;
        })}
        latestDriftReport={(latestDriftReport as { id?: string; content: Record<string, unknown> | null; created_at: string } | null) || null}
        workflow={workflowState}
        readiness={readiness}
        latestJob={(latestRewriteJob as { id: string; status: string | null; created_at: string; completed_at: string | null; settings: Record<string, unknown> | null } | null) || null}
      />

      <PostRunQualityGate
        bookId={bookId}
        reports={reports || []}
        latestRewriteJob={
          (latestRewriteJob as {
            id: string;
            status: string | null;
            created_at: string;
            completed_at: string | null;
            settings: Record<string, unknown> | null;
          } | null) || null
        }
        acceptedParagraphs={acceptedTextParagraphCount || 0}
        totalParagraphs={paragraphCount || 0}
        pendingDraftCount={pendingDraftParagraphCount}
      />

      <CriticComparisonPanel
        bookId={bookId}
        reports={reports || []}
        acceptedParagraphs={acceptedTextParagraphCount || 0}
        totalParagraphs={paragraphCount || 0}
      />

      <CriticReportsPanel bookId={bookId} reports={reports || []} />

      <DriftReportsPanel reports={reports || []} />
    </Container>
  );
}

function getSavedModelEvaluation(metadata: Record<string, unknown> | null) {
  const value = metadata?.modelEvaluation;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getCriticCoverage(reports: Array<{ report_type: string }>) {
  const progress = computeCriticProgress(reports);
  return {
    done: progress.baselineCount,
    missing: progress.missingBaselineLenses,
  };
}
