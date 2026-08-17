import { Alert, Button, Container, Group, Title, Text } from "@mantine/core";
import Link from "next/link";
import { AbridgementWorkspace } from "@/components/books/abridgement/abridgement-workspace";
import { getBookCore } from "@/lib/books/book-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AbridgementPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase before using abridgement planning.</Alert>
      </Container>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [{ data: book, error }, { data: plan }, { data: suggestions, error: suggestionsError }] = await Promise.all([
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
      .select(
        "id,suggestion_type,title,rationale,estimated_word_savings,continuity_risk,status,chapters:chapters!abridgement_suggestions_chapter_id_fkey(chapter_number,title),paragraphs(paragraph_number)",
      )
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (error || !book) {
    return (
      <Container>
        <Alert color="red">Book not found or you do not have access.</Alert>
      </Container>
    );
  }

  if (suggestionsError) {
    console.error("Failed to load abridgement suggestions", suggestionsError);
  }

  return (
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
        </Group>
      </Group>
      <AbridgementWorkspace bookId={bookId} plan={plan || null} suggestions={normalizeSuggestions(suggestions || [])} />
    </Container>
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
