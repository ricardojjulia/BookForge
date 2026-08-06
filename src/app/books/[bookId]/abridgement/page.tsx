import { Alert, Button, Container, Group, Title, Text } from "@mantine/core";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { AbridgementWorkspace } from "@/components/books/abridgement/abridgement-workspace";
import { getBookCore } from "@/lib/books/book-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AbridgementPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container>
          <Alert color="yellow">Configure Supabase before using abridgement planning.</Alert>
        </Container>
      </AppShell>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [{ data: book, error }, { data: plan }, { data: suggestions }] = await Promise.all([
    getBookCore(supabase, bookId),
    supabase
      .from("abridgement_plans")
      .select("id,target_reduction_percent,summary,created_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("abridgement_suggestions")
      .select("id,suggestion_type,title,rationale,estimated_word_savings,continuity_risk,status,chapters(chapter_number,title),paragraphs(paragraph_number)")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(200),
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

  return (
    <AppShell>
      <Container size="xl">
        <Group justify="space-between" mb="xl">
          <div>
            <Title>Abridged Edition Builder</Title>
            <Text c="dimmed">{book.title}</Text>
          </div>
          <Group>
            <Link href={`/books/${bookId}/final-manuscript`} style={{ textDecoration: "none" }}>
              <Button color="green" variant="light">
                Export
              </Button>
            </Link>
            <Link href={`/books/${bookId}`} style={{ textDecoration: "none" }}>
              <Button color="dark" variant="subtle">
                Back to Book
              </Button>
            </Link>
          </Group>
        </Group>
        <AbridgementWorkspace bookId={bookId} plan={plan || null} suggestions={normalizeSuggestions(suggestions || [])} />
      </Container>
    </AppShell>
  );
}

function normalizeSuggestions(rows: unknown[]) {
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      ...record,
      chapters: Array.isArray(record.chapters) ? record.chapters[0] || null : record.chapters || null,
      paragraphs: Array.isArray(record.paragraphs) ? record.paragraphs[0] || null : record.paragraphs || null,
    };
  }) as Parameters<typeof AbridgementWorkspace>[0]["suggestions"];
}
