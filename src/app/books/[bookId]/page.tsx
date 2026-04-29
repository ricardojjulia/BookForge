import { Alert, Badge, Button, Container, Group, Paper, SimpleGrid, Table, Text, Title } from "@mantine/core";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { BookActions } from "@/components/books/book-actions";
import { ChapterSummaryReview } from "@/components/books/chapter-summary-review";
import { ChapterSummaryViewer } from "@/components/books/chapter-summary-viewer";
import { ChapterMetadataPanel } from "@/components/books/chapter-metadata-panel";
import { DeleteBookButton } from "@/components/books/delete-book-button";
import { PersistentAiJobsPanel } from "@/components/books/jobs/persistent-ai-jobs-panel";
import { BookInputsManager } from "@/components/books/inputs/book-inputs-manager";
import { PassageLockManager } from "@/components/books/passage-lock-manager";
import { CriticComparisonPanel } from "@/components/books/reports/critic-comparison-panel";
import { CriticReportsPanel } from "@/components/books/reports/critic-reports-panel";
import { CriticScoreboard } from "@/components/books/reports/critic-scoreboard";
import { DriftReportsPanel } from "@/components/books/reports/drift-reports-panel";
import { HumanizedGuidancePanel } from "@/components/books/reports/humanized-guidance-panel";
import { PostRunQualityGate } from "@/components/books/rewrite/post-run-quality-gate";
import { SceneEditorPanel } from "@/components/books/scene-editor-panel";
import { StructureAuditPanel } from "@/components/books/structure-audit-panel";
import { getRewriteReadiness } from "@/lib/rewrite/readiness";
import type { RewriteWorkflowRow } from "@/lib/rewrite/workflows";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BookDashboardPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container>
          <Alert color="yellow">Configure Supabase before opening a book.</Alert>
        </Container>
      </AppShell>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [
    { data: book, error },
    { data: chapters },
    { count: paragraphs },
    { count: scenes },
    { data: bible },
    { data: authorNotes },
    { data: characters },
    { data: styleSamples },
    { data: matterSections },
    { data: revisionInstructions },
    { data: reports },
    { count: acceptedParagraphs },
    { data: paragraphRows },
    { data: sceneRows },
    { data: latestRewriteJob },
    { data: rewriteWorkflow },
    { data: rewritePlan },
    { data: latestDriftReport },
  ] =
    await Promise.all([
      supabase.from("books").select("*").eq("id", bookId).single(),
      supabase
        .from("chapters")
        .select("id,chapter_number,title,summary,status,original_text,section_type,exclude_from_rewrite,exclude_from_export,structure_notes")
        .eq("book_id", bookId)
        .order("chapter_number"),
      supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase.from("scenes").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase.from("book_bibles").select("content,updated_at").eq("book_id", bookId).maybeSingle(),
      supabase
        .from("author_notes")
        .select("creative_instructions,voice_guidance,worldview_notes,theological_alignment,forbidden_changes")
        .eq("book_id", bookId)
        .maybeSingle(),
      supabase
        .from("characters")
        .select("id,name,role,age,description,voice_notes,motivation,do_not_change_notes")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false }),
      supabase
        .from("style_samples")
        .select("id,title,guidance_notes")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false }),
      supabase
        .from("book_matter_sections")
        .select("id,section_type,title")
        .eq("book_id", bookId)
        .order("sort_order"),
      supabase
        .from("revision_instructions")
        .select("id,title,scope")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false }),
      supabase
        .from("coherence_reports")
        .select("id,report_type,created_at,content")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId).not("accepted_text", "is", null),
      supabase
        .from("paragraphs")
        .select("id,chapter_id,scene_id,paragraph_number,original_text,is_locked")
        .eq("book_id", bookId)
        .order("paragraph_number"),
      supabase
        .from("scenes")
        .select("id,chapter_id,scene_number,title,summary,status")
        .eq("book_id", bookId)
        .order("scene_number"),
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
    ]);

  if (error || !book) {
    return (
      <AppShell>
        <Container>
          <Alert color="red">Book not found or you do not have access.</Alert>
        </Container>
      </AppShell>
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

  return (
    <AppShell>
      <Container size="xl">
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
              {book.author_name || "Unknown author"} · {book.point_of_view || "POV unset"} · {book.tense || "tense unset"}
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
              <Link href={`/books/${bookId}/rewrite-plan`} style={{ textDecoration: "none" }}>
                <Button color="grape">
                  Continue Rewrite Workflow
                </Button>
              </Link>
            </Group>
          </Paper>
        )}

        <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
          <Group justify="space-between" mb="lg" align="flex-start">
            <div>
              <Title order={2}>Studio Actions</Title>
              <Text c="dimmed">
                Analyze, evaluate, revise, review, and export this manuscript from one controlled workflow.
              </Text>
            </div>
            <Badge color="grape" variant="light">
              Local AI via LM Studio
            </Badge>
            <Link href={`/books/${bookId}/abridgement`} style={{ textDecoration: "none" }}>
              <Button color="teal" variant="light">
                Abridged Edition
              </Button>
            </Link>
          </Group>
          <BookActions
            bookId={bookId}
            chapterCount={chapters?.length || 0}
            sceneCount={scenes || 0}
            paragraphCount={paragraphs || 0}
            plannedChapterCount={plannedChapterCount}
          />
        </Paper>

        <div style={{ marginTop: 24 }}>
          <PersistentAiJobsPanel bookId={bookId} />
        </div>

        <CriticReportsPanel bookId={bookId} reports={reports || []} />

        <CriticComparisonPanel
          bookId={bookId}
          reports={reports || []}
          acceptedParagraphs={acceptedParagraphs || 0}
          totalParagraphs={paragraphs || 0}
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
          acceptedParagraphs={acceptedParagraphs || 0}
          totalParagraphs={paragraphs || 0}
        />

        <DriftReportsPanel reports={reports || []} />

        <HumanizedGuidancePanel bookId={bookId} reports={reports || []} />

        <ChapterMetadataPanel chapters={chapters || []} paragraphs={paragraphRows || []} />

        <StructureAuditPanel chapters={chapters || []} paragraphs={paragraphRows || []} />

        <SceneEditorPanel chapters={chapters || []} scenes={sceneRows || []} paragraphs={paragraphRows || []} />

        <div style={{ marginTop: 24 }}>
          <BookInputsManager
            bookId={bookId}
            bible={bible}
            authorNotes={authorNotes}
            characters={characters || []}
            styleSamples={styleSamples || []}
            matterSections={matterSections || []}
            revisionInstructions={revisionInstructions || []}
          />
        </div>

        <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
          <Title order={2} mb="md">
            Chapter Browser
          </Title>
          <ChapterSummaryReview bookId={bookId} chapters={chapters || []} />
          <PassageLockManager chapters={chapters || []} paragraphs={paragraphRows || []} />
          <Table striped highlightOnHover>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Status</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {chapters?.map((chapter) => (
                <tr key={chapter.id}>
                  <td>{chapter.chapter_number}</td>
                  <td>{chapter.title}</td>
                  <td>
                    <Badge variant="light">{chapter.status}</Badge>
                  </td>
                  <td>
                    <ChapterSummaryViewer
                      chapterId={chapter.id}
                      chapterNumber={chapter.chapter_number}
                      title={chapter.title}
                      summary={chapter.summary}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Paper>
      </Container>
    </AppShell>
  );
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
