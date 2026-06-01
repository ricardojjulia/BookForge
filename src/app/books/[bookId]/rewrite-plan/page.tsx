import { Alert, Button, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import { RewriteExecutionPanel } from "@/components/books/rewrite/rewrite-execution-panel";
import { RewriteModelEvaluator } from "@/components/books/rewrite/rewrite-model-evaluator";
import { RewritePlanActions } from "@/components/books/rewrite/rewrite-plan-actions";
import { RewritePlanView } from "@/components/books/rewrite/rewrite-plan-view";
import { ResetRewriteButton } from "@/components/books/rewrite/reset-rewrite-button";
import { ReadinessStatusGrid } from "@/components/books/rewrite/readiness-status-grid";
import { criticLenses } from "@/lib/critic/prompts";
import { getRewriteCampaignStats, type RewriteCampaignRow } from "@/lib/rewrite/campaigns";
import { getRewriteReadiness } from "@/lib/rewrite/readiness";
import { getDefaultRewriteWorkflow, type RewriteWorkflowRow } from "@/lib/rewrite/workflows";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { CriticLens } from "@/lib/types";

export default async function RewritePlanPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container>
          <Alert color="yellow">Configure Supabase before opening rewrite planning.</Alert>
        </Container>
      </AppShell>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [
    { data: book, error: bookError },
    { data: chapters },
    { data: bible },
    { data: critics },
    { data: rewritePlan },
    { data: latestRewriteJob },
    { count: paragraphCount },
    { data: pendingDrafts },
    { data: acceptedDrafts },
    { data: paragraphCoverageRows },
    { data: revisionCoverageRows },
    { data: activeCampaign },
    { data: recentRewriteJobs },
    { data: latestDriftReport },
    { data: workflow },
  ] = await Promise.all([
    supabase.from("books").select("title,genre,target_audience").eq("id", bookId).single(),
    supabase.from("chapters").select("id,chapter_number,title,summary,original_text").eq("book_id", bookId).order("chapter_number"),
    supabase
      .from("book_bibles")
      .select("content,updated_at")
      .eq("book_id", bookId)
      .maybeSingle(),
    supabase
      .from("coherence_reports")
      .select("report_type,created_at,content")
      .eq("book_id", bookId)
      .like("report_type", "critic:%")
      .order("created_at", { ascending: false })
      .limit(30),
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
      .select("paragraph_id")
      .eq("book_id", bookId)
      .eq("accepted", false)
      .eq("rejected", false)
      .not("paragraph_id", "is", null),
      supabase
        .from("revision_versions")
        .select("paragraph_id")
        .eq("book_id", bookId)
        .eq("accepted", true)
        .not("paragraph_id", "is", null),
      supabase
        .from("paragraphs")
        .select("id,chapter_id")
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
  ]);

  if (bookError || !book) {
    return (
      <AppShell>
        <Container>
          <Alert color="red">Book not found or you do not have access.</Alert>
        </Container>
      </AppShell>
    );
  }

  const criticCoverage = getCriticCoverage(critics || []);
  const summarized = (chapters || []).filter((chapter) => chapter.summary).length;
  const chapterCount = chapters?.length || 0;
  const pendingDraftParagraphCount = new Set((pendingDrafts || []).map((row) => row.paragraph_id).filter(Boolean)).size;
  const acceptedParagraphCount = new Set((acceptedDrafts || []).map((row) => row.paragraph_id).filter(Boolean)).size;
  const untouchedParagraphCount = Math.max(0, (paragraphCount || 0) - pendingDraftParagraphCount - acceptedParagraphCount);
  const rewriteCoverage = getRewriteCoverage(chapters || [], paragraphCoverageRows || [], revisionCoverageRows || []);
  const campaignStats = getRewriteCampaignStats({
    paragraphCount: paragraphCount || 0,
    pendingDraftParagraphCount,
    acceptedParagraphCount,
    rewriteCoverage,
  });
  const workflowState = (workflow as RewriteWorkflowRow | null) || getDefaultRewriteWorkflow(bookId);
  const readiness = getRewriteReadiness({
    bookId,
    hasBlueprint: Boolean(bible),
    hasRewritePlan: Boolean(rewritePlan),
    chapters: chapters || [],
    criticReports: critics || [],
    latestRewriteJobId: latestRewriteJob?.id || null,
    pendingDraftParagraphCount,
    acceptedParagraphCount,
    untouchedParagraphCount,
    latestDriftReportId: latestDriftReport?.id || null,
    modelEvaluation: getSavedModelEvaluation(workflowState.metadata),
    workflow: workflowState,
  });

  return (
    <AppShell>
      <Container size="xl">
        <DataFreshnessBanner routeKey={`book:${bookId}:rewrite-plan`} fetchedAt={new Date().toISOString()} label="Rewrite planning data" />
        <Group justify="space-between" mb="xl" align="flex-start">
          <div>
            <Title>Rewrite Architect</Title>
            <Text c="dimmed">
              {book.title} · {book.genre || "Genre unset"} · {book.target_audience || "Audience unset"}
            </Text>
          </div>
          <Link href={`/books/${bookId}`} style={{ textDecoration: "none" }}>
            <Button variant="light" color="grape">
              Back to Book
            </Button>
          </Link>
          <ResetRewriteButton bookId={bookId} />
        </Group>

        <div id="readiness-status">
          <ReadinessStatusGrid
            bookId={bookId}
            summarized={summarized}
            chapterCount={chapterCount}
            hasBlueprint={Boolean(bible)}
            criticDone={criticCoverage.done}
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
                    You can generate a plan now, but the strongest plan comes after all seven lenses have been run.
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
      </Container>
    </AppShell>
  );
}

function getRewriteCoverage(
  chapters: Array<{ id: string; chapter_number: number; title: string | null }>,
  paragraphs: Array<{ id: string; chapter_id: string }>,
  revisions: Array<{ paragraph_id: string | null }>,
) {
  const paragraphIdsWithRevisions = new Set(revisions.map((revision) => revision.paragraph_id).filter(Boolean));
  const paragraphsByChapter = paragraphs.reduce<Record<string, Array<{ id: string }>>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});

  return chapters.map((chapter) => {
    const chapterParagraphs = paragraphsByChapter[chapter.id] || [];
    const rewritten = chapterParagraphs.filter((paragraph) => paragraphIdsWithRevisions.has(paragraph.id)).length;
    return {
      chapterId: chapter.id,
      chapterNumber: chapter.chapter_number,
      title: chapter.title,
      totalParagraphs: chapterParagraphs.length,
      rewrittenParagraphs: rewritten,
    };
  });
}


function getSavedModelEvaluation(metadata: Record<string, unknown> | null) {
  const value = metadata?.modelEvaluation;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getCriticCoverage(reports: Array<{ report_type: string }>) {
  const done = new Set<CriticLens>();

  for (const report of reports) {
    const lens = report.report_type.replace(/^critic:/, "") as CriticLens;
    if (lens in criticLenses) done.add(lens);
  }

  const all = Object.keys(criticLenses) as CriticLens[];
  return {
    done: done.size,
    missing: all.filter((lens) => !done.has(lens)),
  };
}
