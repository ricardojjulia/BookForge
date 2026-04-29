import { Alert, Badge, Button, Container, Group, Paper, Progress, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ChapterAcceptanceWorkflow, type ChapterFinalReadiness } from "@/components/books/export/chapter-acceptance-workflow";
import { FinalQualityGate } from "@/components/books/export/final-quality-gate";
import { FinalManuscriptBuilder } from "@/components/books/export/final-manuscript-builder";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ExportRow = {
  id: string;
  format: string;
  storage_path: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
};

type ChapterRow = {
  id: string;
  chapter_number: number;
  title: string | null;
};

type ParagraphRow = {
  id: string;
  chapter_id: string;
  accepted_text: string | null;
  is_locked: boolean | null;
};

type RevisionRow = {
  paragraph_id: string | null;
  accepted: boolean | null;
  rejected: boolean | null;
  created_at: string;
};

export default async function FinalManuscriptPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container>
          <Alert color="yellow">Configure Supabase before building a manuscript export.</Alert>
        </Container>
      </AppShell>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [
    { data: book, error: bookError },
    { count: totalParagraphs },
    { count: acceptedParagraphs },
    { count: lockedParagraphs },
    { count: pendingDrafts },
    { data: chapters },
    { data: paragraphs },
    { data: revisions },
    { data: latestDriftReport },
    { data: latestCriticReports },
    { data: latestRewriteJob },
    { data: exports },
  ] = await Promise.all([
    supabase.from("books").select("title").eq("id", bookId).single(),
    supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId),
    supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId).not("accepted_text", "is", null),
    supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId).eq("is_locked", true),
    supabase
      .from("revision_versions")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId)
      .eq("accepted", false)
      .eq("rejected", false),
    supabase.from("chapters").select("id,chapter_number,title").eq("book_id", bookId).order("chapter_number"),
    supabase.from("paragraphs").select("id,chapter_id,accepted_text,is_locked").eq("book_id", bookId),
    supabase
      .from("revision_versions")
      .select("paragraph_id,accepted,rejected,created_at")
      .eq("book_id", bookId)
      .not("paragraph_id", "is", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("coherence_reports")
      .select("content,created_at")
      .eq("book_id", bookId)
      .eq("report_type", "rewrite_drift_check")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("coherence_reports")
      .select("report_type,content,created_at")
      .eq("book_id", bookId)
      .like("report_type", "critic:%")
      .order("created_at", { ascending: false })
      .limit(14),
    supabase
      .from("revision_jobs")
      .select("id,status,created_at")
      .eq("book_id", bookId)
      .eq("mode", "full_book_rewrite")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("exports")
      .select("id,format,storage_path,status,metadata,created_at,completed_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(20),
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

  const exportRows = await addSignedUrls(supabase, (exports || []) as ExportRow[]);
  const chapterReadiness = buildChapterReadiness(
    (chapters || []) as ChapterRow[],
    (paragraphs || []) as ParagraphRow[],
    (revisions || []) as RevisionRow[],
  );
  const finalReadiness = getFinalReadiness({
    totalParagraphs: totalParagraphs || 0,
    acceptedParagraphs: acceptedParagraphs || 0,
    lockedParagraphs: lockedParagraphs || 0,
    pendingDrafts: pendingDrafts || 0,
    chapters: chapterReadiness,
    driftRisk: stringValue((latestDriftReport?.content as Record<string, unknown> | null)?.overallDriftRisk) || "not checked",
    criticReports: latestCriticReports || [],
  });
  const acceptedPercent = totalParagraphs ? Math.round(((acceptedParagraphs || 0) / totalParagraphs) * 100) : 0;
  const finalQualityReports = [
    ...((latestCriticReports || []) as Array<{ report_type: string; content: Record<string, unknown> | null; created_at: string }>),
    ...(latestDriftReport
      ? [
          {
            report_type: "rewrite_drift_check",
            content: (latestDriftReport.content as Record<string, unknown> | null) || null,
            created_at: latestDriftReport.created_at,
          },
        ]
      : []),
  ];

  return (
    <AppShell>
      <Container size="xl">
        <Group justify="space-between" mb="xl" align="flex-start">
          <div>
            <Title>Final Manuscript Builder</Title>
            <Text c="dimmed">{book.title}</Text>
          </div>
          <Group>
            <Link href={`/books/${bookId}/revisions`} style={{ textDecoration: "none" }}>
              <Button variant="light" color="teal">
                Review Draft Revisions
              </Button>
            </Link>
            <Link href={`/books/${bookId}/abridgement`} style={{ textDecoration: "none" }}>
              <Button variant="light" color="grape">
                Abridged Edition
              </Button>
            </Link>
            <Link href={`/books/${bookId}`} style={{ textDecoration: "none" }}>
              <Button variant="subtle" color="dark">
                Back to Book
              </Button>
            </Link>
          </Group>
        </Group>

        <FinalManuscriptBuilder
          bookId={bookId}
          acceptedParagraphs={acceptedParagraphs || 0}
          totalParagraphs={totalParagraphs || 0}
          lockedParagraphs={lockedParagraphs || 0}
        />

        <FinalReadinessPanel readiness={finalReadiness} />
        <ChapterAcceptanceWorkflow chapters={chapterReadiness} />
        <AssemblySourcePreview chapters={chapterReadiness} />
        <FinalQualityGate
          bookId={bookId}
          reports={finalQualityReports}
          latestRewriteJobId={latestRewriteJob?.id || null}
          acceptedPercent={acceptedPercent}
        />

        <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
          <Title order={2} mb="md">
            Recent exports
          </Title>
          {!exportRows.length ? (
            <Text c="dimmed">No final manuscript exports yet.</Text>
          ) : (
            <Table striped highlightOnHover>
              <thead>
                <tr>
                  <th>Format</th>
                  <th>Source</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {exportRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.format.toUpperCase()}</td>
                    <td>
                      <Text size="sm">{stringValue(row.metadata?.sourceMode) || "unknown"}</Text>
                      {Boolean(row.metadata?.abridgedMode) && (
                        <Badge color="grape" variant="light" size="xs">
                          abridged
                        </Badge>
                      )}
                    </td>
                    <td>
                      <Text size="sm">{numberValue(row.metadata?.exportedParagraphCount) || "?"} paragraphs</Text>
                      <Text size="xs" c="dimmed">
                        {numberValue(row.metadata?.chapterCount) || "?"} chapters
                      </Text>
                    </td>
                    <td>
                      <Badge color={row.status === "completed" ? "green" : row.status === "failed" ? "red" : "yellow"}>
                        {row.status || "pending"}
                      </Badge>
                      {Array.isArray(row.metadata?.warnings) && row.metadata.warnings.length > 0 && (
                        <Text size="xs" c="yellow.8">
                          {row.metadata.warnings.length} warning{row.metadata.warnings.length === 1 ? "" : "s"}
                        </Text>
                      )}
                    </td>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>
                      {row.signedUrl ? (
                        <Button component="a" href={row.signedUrl} target="_blank" rel="noreferrer" size="xs" variant="light">
                          Download
                        </Button>
                      ) : (
                        <Text size="sm" c="dimmed">
                          Not available
                        </Text>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Paper>
      </Container>
    </AppShell>
  );
}

function FinalReadinessPanel({
  readiness,
}: {
  readiness: {
    acceptedPercent: number;
    pendingDrafts: number;
    lockedParagraphs: number;
    chaptersMissingAccepted: number;
    chaptersReady: number;
    chapterCount: number;
    driftRisk: string;
    criticStatus: string;
    status: string;
    color: string;
    guidance: string;
  };
}) {
  return (
    <Paper withBorder radius="md" p="xl" bg="#fffdf8" mt="xl">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Final Readiness</Title>
            <Text c="dimmed" size="sm">
              BookForge checks whether the rewrite work is reviewed enough to assemble a serious final manuscript.
            </Text>
          </div>
          <Badge color={readiness.color} variant="light">
            {readiness.status}
          </Badge>
        </Group>
        <Progress value={readiness.acceptedPercent} color={readiness.color} radius="xl" size="lg" />
        <SimpleGrid cols={{ base: 1, md: 4 }}>
          <ReadinessMetric label="Accepted coverage" value={`${readiness.acceptedPercent}%`} />
          <ReadinessMetric label="Pending decisions" value={readiness.pendingDrafts} />
          <ReadinessMetric label="Chapters ready" value={`${readiness.chaptersReady}/${readiness.chapterCount}`} />
          <ReadinessMetric label="Drift risk" value={readiness.driftRisk} />
        </SimpleGrid>
        <Alert color={readiness.color} variant="light">
          {readiness.guidance}
        </Alert>
        <Text size="sm" c="dimmed">
          Locked passages: {readiness.lockedParagraphs}. Chapters with no accepted revisions: {readiness.chaptersMissingAccepted}. Critic status: {readiness.criticStatus}.
        </Text>
      </Stack>
    </Paper>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <Paper withBorder radius="sm" p="md" bg="white">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={900}>{value}</Text>
    </Paper>
  );
}

function AssemblySourcePreview({ chapters }: { chapters: ChapterFinalReadiness[] }) {
  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Title order={2} mb="sm">
        Assembly Source Preview
      </Title>
      <Text c="dimmed" size="sm" mb="md">
        In accepted-revisions mode, paragraphs without accepted text fall back to original manuscript text.
      </Text>
      <Table striped highlightOnHover>
        <thead>
          <tr>
            <th>Chapter</th>
            <th>Accepted source</th>
            <th>Original fallback</th>
            <th>Warning</th>
          </tr>
        </thead>
        <tbody>
          {chapters.map((chapter) => {
            const fallback = Math.max(0, chapter.totalParagraphs - chapter.acceptedParagraphs);
            const acceptedPercent = chapter.totalParagraphs ? Math.round((chapter.acceptedParagraphs / chapter.totalParagraphs) * 100) : 0;
            return (
              <tr key={chapter.chapterId}>
                <td>
                  {chapter.chapterNumber}. {chapter.title || "Untitled"}
                </td>
                <td>{chapter.acceptedParagraphs}</td>
                <td>{fallback}</td>
                <td>
                  <Badge color={acceptedPercent >= 90 ? "green" : acceptedPercent >= 50 ? "yellow" : "red"} variant="light">
                    {acceptedPercent >= 90 ? "mostly reviewed" : acceptedPercent >= 50 ? "mixed source" : "mostly original"}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Paper>
  );
}

function buildChapterReadiness(chapters: ChapterRow[], paragraphs: ParagraphRow[], revisions: RevisionRow[]): ChapterFinalReadiness[] {
  const paragraphsByChapter = paragraphs.reduce<Record<string, ParagraphRow[]>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});
  const pendingByParagraph = new Set(
    revisions
      .filter((revision) => !revision.accepted && !revision.rejected && revision.paragraph_id)
      .map((revision) => revision.paragraph_id as string),
  );
  const latestByParagraph = new Set(
    revisions
      .filter((revision) => !revision.rejected && revision.paragraph_id)
      .map((revision) => revision.paragraph_id as string),
  );

  return chapters.map((chapter) => {
    const chapterParagraphs = paragraphsByChapter[chapter.id] || [];
    return {
      chapterId: chapter.id,
      chapterNumber: chapter.chapter_number,
      title: chapter.title,
      totalParagraphs: chapterParagraphs.length,
      acceptedParagraphs: chapterParagraphs.filter((paragraph) => paragraph.accepted_text).length,
      pendingDraftParagraphs: chapterParagraphs.filter((paragraph) => pendingByParagraph.has(paragraph.id)).length,
      latestDraftParagraphs: chapterParagraphs.filter((paragraph) => latestByParagraph.has(paragraph.id)).length,
      lockedParagraphs: chapterParagraphs.filter((paragraph) => paragraph.is_locked).length,
    };
  });
}

function getFinalReadiness(input: {
  totalParagraphs: number;
  acceptedParagraphs: number;
  lockedParagraphs: number;
  pendingDrafts: number;
  chapters: ChapterFinalReadiness[];
  driftRisk: string;
  criticReports: Array<{ report_type: string; created_at: string }>;
}) {
  const acceptedPercent = input.totalParagraphs ? Math.round((input.acceptedParagraphs / input.totalParagraphs) * 100) : 0;
  const chaptersMissingAccepted = input.chapters.filter((chapter) => chapter.totalParagraphs > 0 && chapter.acceptedParagraphs === 0).length;
  const chaptersReady = input.chapters.filter((chapter) => {
    const percent = chapter.totalParagraphs ? Math.round((chapter.acceptedParagraphs / chapter.totalParagraphs) * 100) : 0;
    return percent >= 90 && chapter.pendingDraftParagraphs === 0;
  }).length;
  const criticStatus = getCriticStatus(input.criticReports);
  const highDrift = ["high", "critical"].includes(input.driftRisk.toLowerCase());

  if (highDrift) {
    return {
      acceptedPercent,
      pendingDrafts: input.pendingDrafts,
      lockedParagraphs: input.lockedParagraphs,
      chaptersMissingAccepted,
      chaptersReady,
      chapterCount: input.chapters.length,
      driftRisk: input.driftRisk,
      criticStatus,
      status: "review drift first",
      color: "red",
      guidance: "High drift risk is present. Review drift findings before treating this as a final manuscript.",
    };
  }
  if (acceptedPercent >= 90 && input.pendingDrafts <= 10 && chaptersMissingAccepted === 0) {
    return {
      acceptedPercent,
      pendingDrafts: input.pendingDrafts,
      lockedParagraphs: input.lockedParagraphs,
      chaptersMissingAccepted,
      chaptersReady,
      chapterCount: input.chapters.length,
      driftRisk: input.driftRisk,
      criticStatus,
      status: "export ready",
      color: "green",
      guidance: "The manuscript has strong accepted coverage. Preview assembly, rerun Critic if needed, then export.",
    };
  }
  return {
    acceptedPercent,
    pendingDrafts: input.pendingDrafts,
    lockedParagraphs: input.lockedParagraphs,
    chaptersMissingAccepted,
    chaptersReady,
    chapterCount: input.chapters.length,
    driftRisk: input.driftRisk,
    criticStatus,
    status: "not final yet",
    color: "yellow",
    guidance: "Keep accepting reviewed chapter drafts or export a preview only. Accepted-revisions export will still use original text where no accepted rewrite exists.",
  };
}

function getCriticStatus(reports: Array<{ report_type: string; created_at: string }>) {
  const postRewriteCount = reports.filter((report) => report.report_type.startsWith("critic_post:")).length;
  if (postRewriteCount > 0) return "post-rewrite reports found";
  return reports.length ? "baseline reports only" : "not run";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function addSignedUrls(supabase: Awaited<ReturnType<typeof createClient>>, rows: ExportRow[]) {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.storage_path || row.status !== "completed") {
        return { ...row, signedUrl: null };
      }
      const { data } = await supabase.storage.from("exports").createSignedUrl(row.storage_path, 60 * 10);
      return { ...row, signedUrl: data?.signedUrl || null };
    }),
  );
}
