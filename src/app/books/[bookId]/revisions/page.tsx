import { Alert, Button, Container, Group, Paper, SimpleGrid, Text, Title } from "@mantine/core";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ChapterSnapshotPanel } from "@/components/books/chapter-snapshot-panel";
import { RevisionStatsPanel } from "@/components/books/revision-stats-panel";
import { RevisionReviewList } from "@/components/books/revisions/revision-review-list";
import { ResetRewriteButton } from "@/components/books/rewrite/reset-rewrite-button";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RawVersion = {
  id: string;
  revision_job_id: string | null;
  original_text: string;
  revised_text: string;
  revision_notes: string | null;
  accepted: boolean | null;
  rejected: boolean | null;
  created_at: string;
  continuity_warnings: unknown;
  revision_jobs?: { id?: string | null; mode?: string | null; created_at?: string | null } | null;
  chapters?: { title?: string | null; chapter_number?: number | null } | null;
  paragraphs?: { paragraph_number?: number | null; is_locked?: boolean | null } | null;
  paragraph_id: string | null;
};

export default async function RevisionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container>
          <Alert color="yellow">Configure Supabase before reviewing revisions.</Alert>
        </Container>
      </AppShell>
    );
  }

  const { bookId } = await params;
  const requestedJob = (await searchParams).job;
  const supabase = await createClient();
  const [
    { data: book, error: bookError },
    { data: versions },
    { data: latestRewriteJob },
    { data: rewritePlan },
    { count: pending },
    { count: accepted },
  ] =
    await Promise.all([
      supabase.from("books").select("title").eq("id", bookId).single(),
      supabase
        .from("revision_versions")
        .select(
          "id,revision_job_id,paragraph_id,original_text,revised_text,revision_notes,accepted,rejected,created_at,continuity_warnings,revision_jobs(id,mode,created_at),chapters(title,chapter_number),paragraphs(paragraph_number,is_locked)",
        )
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("revision_jobs")
        .select("id,status")
        .eq("book_id", bookId)
        .eq("mode", "full_book_rewrite")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("coherence_reports")
        .select("id,created_at")
        .eq("book_id", bookId)
        .eq("report_type", "rewrite_plan")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("revision_versions")
        .select("id", { count: "exact", head: true })
        .eq("book_id", bookId)
        .eq("accepted", false)
        .eq("rejected", false),
      supabase
        .from("revision_versions")
        .select("id", { count: "exact", head: true })
        .eq("book_id", bookId)
        .eq("accepted", true),
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

  const { data: chapters } = await supabase.from("chapters").select("id,chapter_number,title").eq("book_id", bookId).order("chapter_number");
  const firstChapter = (chapters || [])[0];

  const mapped = ((versions || []) as RawVersion[]).map((version) => ({
    id: version.id,
    revisionJobId: version.revision_job_id,
    original_text: version.original_text,
    revised_text: version.revised_text,
    revision_notes: version.revision_notes,
    accepted: version.accepted,
    rejected: version.rejected,
    created_at: version.created_at,
    continuity_warnings: version.continuity_warnings,
    paragraphId: version.paragraph_id,
    isLocked: Boolean(version.paragraphs?.is_locked),
    chapterTitle: version.chapters?.title || "Untitled chapter",
    chapterNumber: version.chapters?.chapter_number || null,
    paragraphNumber: version.paragraphs?.paragraph_number || null,
    jobMode: version.revision_jobs?.mode || "revision",
    jobCreatedAt: version.revision_jobs?.created_at || null,
  }));

  return (
    <AppShell>
      <Container size="xl">
        <Group justify="space-between" mb="xl" align="flex-start">
          <div>
            <Title>Revision Review</Title>
            <Text c="dimmed">{book.title}</Text>
          </div>
          <Group>
            <Link href={`/books/${bookId}/rewrite-plan`} style={{ textDecoration: "none" }}>
              <Button variant="light" color="grape">
                Rewrite Architect
              </Button>
            </Link>
            <Link href={`/books/${bookId}`} style={{ textDecoration: "none" }}>
              <Button variant="subtle" color="dark">
                Back to Book
              </Button>
            </Link>
            <ResetRewriteButton bookId={bookId} />
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 3 }} mb="xl">
          <Metric label="Draft revisions" value={mapped.length} />
          <Metric label="Needs review" value={pending || 0} />
          <Metric label="Accepted" value={accepted || 0} />
        </SimpleGrid>

        <RevisionStatsPanel bookId={bookId} />

        {firstChapter && (
          <ChapterSnapshotPanel
            bookId={bookId}
            chapterId={firstChapter.id}
            chapterLabel={`Ch. ${firstChapter.chapter_number}${firstChapter.title ? ` — ${firstChapter.title}` : ""}`}
          />
        )}

        <RevisionReviewList
          bookId={bookId}
          versions={mapped}
          latestRewriteJobId={latestRewriteJob?.id || null}
          hasRewritePlan={Boolean(rewritePlan)}
          latestRewriteJobStatus={latestRewriteJob?.status || null}
          initialJobFilter={requestedJob === "latest" ? latestRewriteJob?.id || null : requestedJob || null}
        />
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
