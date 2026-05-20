import { Alert, Badge, Container, Paper, Stack, Text, Title } from "@mantine/core";
import { AppShell } from "@/components/layout/app-shell";
import { ReaderView } from "@/components/books/reader/reader-view";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ReaderPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container>
          <Alert color="yellow">Configure Supabase to use the reader view.</Alert>
        </Container>
      </AppShell>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();

  const [{ data: book }, { data: chapters }, { data: paragraphs }, { data: annotations }] = await Promise.all([
    supabase.from("books").select("id,title,author_name").eq("id", bookId).single(),
    supabase.from("chapters").select("id,chapter_number,title").eq("book_id", bookId).order("chapter_number"),
    supabase.from("paragraphs").select("id,chapter_id,paragraph_number,original_text,accepted_text").eq("book_id", bookId).order("paragraph_number"),
    supabase.from("reader_annotations").select("id,paragraph_id,note,resolved,created_at").eq("book_id", bookId).order("created_at", { ascending: false }),
  ]);

  if (!book) {
    return (
      <AppShell>
        <Container>
          <Alert color="red">Book not found or access denied.</Alert>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container size="md">
        <Stack gap="xs" mb="xl">
          <Title>{book.title}</Title>
          {book.author_name && <Text c="dimmed">{book.author_name}</Text>}
          <Badge color="grape" variant="light" w="fit-content">Beta Reader View</Badge>
        </Stack>
        <ReaderView
          bookId={bookId}
          chapters={chapters || []}
          paragraphs={paragraphs || []}
          initialAnnotations={annotations || []}
        />
      </Container>
    </AppShell>
  );
}
