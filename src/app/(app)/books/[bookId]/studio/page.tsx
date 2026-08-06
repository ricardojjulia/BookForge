import { Alert, Badge, Button, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { AutoReviewWizard } from "@/components/books/auto-review/auto-review-wizard";
import { BookActions } from "@/components/books/book-actions";
import { PersistentAiJobsPanel } from "@/components/books/jobs/persistent-ai-jobs-panel";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase before opening Studio.</Alert>
      </Container>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [{ data: book, error }, { data: chapters }, { count: scenes }, { count: paragraphs }] = await Promise.all([
    supabase.from("books").select("id,title").eq("id", bookId).single(),
    supabase.from("chapters").select("id,status,original_text").eq("book_id", bookId),
    supabase.from("scenes").select("id", { count: "exact", head: true }).eq("book_id", bookId),
    supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId),
  ]);

  if (error || !book) {
    return (
      <Container>
        <Alert color="red">Book not found or you do not have access.</Alert>
      </Container>
    );
  }

  const plannedChapterCount =
    chapters?.filter(
      (chapter) =>
        chapter.status === "planned" ||
        /Draft text has not been generated yet\. This planned chapter shell was created from BookForge Creator architecture\./i.test(
          chapter.original_text || "",
        ),
    ).length || 0;

  return (
    <Container size="xl">
      <Title mb="xl">Studio</Title>
      <Stack gap="xl">
        <Paper id="studio-actions" withBorder radius="md" p="xl" bg="white">
          <Group justify="space-between" mb="sm" align="flex-start" wrap="nowrap">
            <div>
              <Group gap="xs" mb={4}>
                <Title order={2}>Studio Actions</Title>
                <Badge color="grape" variant="light" size="sm">Local AI via LM Studio</Badge>
              </Group>
              <Text c="dimmed" size="sm">
                Analyze, evaluate, revise, review, and export this manuscript from one controlled workflow.
              </Text>
            </div>
            <AutoReviewWizard bookId={bookId} bookTitle={book.title} />
          </Group>
          <Group gap="xs" mb="lg">
            <Link href={`/books/${bookId}/world`} style={{ textDecoration: "none" }}>
              <Button size="xs" color="violet" variant="light">World Bible</Button>
            </Link>
            <Link href={`/books/${bookId}/read?returnTo=${encodeURIComponent(`/books/${bookId}/studio`)}&returnLabel=${encodeURIComponent("Back to Studio")}`} style={{ textDecoration: "none" }}>
              <Button size="xs" color="cyan" variant="light">Reader View</Button>
            </Link>
            <Link href={`/books/${bookId}/abridgement`} style={{ textDecoration: "none" }}>
              <Button size="xs" color="teal" variant="light">Abridged Edition</Button>
            </Link>
            <Link href={`/books/${bookId}/publishing-lab`} style={{ textDecoration: "none" }}>
              <Button size="xs" color="orange" variant="light">Publishing Lab</Button>
            </Link>
            <Link href={`/books/${bookId}/jobs`} style={{ textDecoration: "none" }}>
              <Button size="xs" color="grape" variant="light">Jobs History</Button>
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

        <PersistentAiJobsPanel bookId={bookId} />
      </Stack>
    </Container>
  );
}
