import { Alert, Badge, Button, Container, Group, Text, Title } from "@mantine/core";
import Link from "next/link";
import { PublishingLabWorkspace } from "@/components/books/publishing-lab/publishing-lab-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PublishingLabBundle = {
  judges: Array<{
    judgeId: string;
    provider: string;
    model: string;
    score: number | null;
    verdict: string;
  }>;
  consensus: {
    publicationReadinessScore: number | null;
    verdict: string;
    readerImpact: string;
    strengths: string[];
    concerns: string[];
    actionableFixes: string[];
    consensusNotes: string;
  };
  assets: {
    description: string;
    dedication: string;
    frontMatter: string;
    backMatter: string;
    authorBiography: string;
  };
  covers: Array<{
    version: number;
    styleName: string;
    subtitle: string;
    blurb: string;
    svg: string;
    imageUrl?: string | null;
    imageProvider?: string | null;
  }>;
  generatedAt: string;
};

type PublishingLabReportRow = {
  id: string;
  created_at: string;
  content: PublishingLabBundle;
};

export default async function PublishingLabPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container>
          <Alert color="yellow">Configure Supabase before using Publishing Lab.</Alert>
        </Container>
      </AppShell>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [{ data: book, error: bookError }, { data: reports }] = await Promise.all([
    supabase.from("books").select("id,title,author_name,status").eq("id", bookId).single(),
    supabase
      .from("coherence_reports")
      .select("id,content,created_at")
      .eq("book_id", bookId)
      .eq("report_type", "publishing_lab_bundle")
      .order("created_at", { ascending: false })
      .limit(12),
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

  const eligible = book.status === "finished";
  const history = ((reports || []) as Array<{ id: string; content: unknown; created_at: string }>).map((report) => ({
    id: report.id,
    created_at: report.created_at,
    content: (report.content as PublishingLabBundle) || null,
  })).filter((row): row is PublishingLabReportRow => Boolean(row.content));

  return (
    <AppShell>
      <Container size="xl">
        <Group justify="space-between" mb="xl" align="flex-start">
          <div>
            <Group gap="sm" mb={4}>
              <Title>Publishing Lab</Title>
              <Badge color={eligible ? "green" : "yellow"} variant="light">
                {eligible ? "Finished book" : "Locked until finished"}
              </Badge>
            </Group>
            <Text c="dimmed">{book.title}</Text>
          </div>
          <Link href={`/books/${bookId}`} style={{ textDecoration: "none" }}>
            <Button color="dark" variant="subtle">Back to Book</Button>
          </Link>
        </Group>

        <PublishingLabWorkspace
          bookId={bookId}
          eligible={eligible}
          initialBundle={history[0]?.content || null}
          initialHistory={history}
        />
      </Container>
    </AppShell>
  );
}
