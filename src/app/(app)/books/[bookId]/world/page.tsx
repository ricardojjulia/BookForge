import { Alert, Container, Text, Title } from "@mantine/core";
import { WorldBibleEditor } from "@/components/books/world/world-bible-editor";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorldBiblePage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase before opening the World Bible.</Alert>
      </Container>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();

  const [
    { data: book },
    { data: characters },
    { data: locations },
    { data: themes },
    { data: motifs },
    { data: timelineNotes },
    { data: chapters },
  ] = await Promise.all([
    supabase
      .from("books")
      .select("id,title,world_bible_processed,world_bible_status,world_bible_processed_at")
      .eq("id", bookId)
      .single(),
    supabase.from("characters").select("*").eq("book_id", bookId).order("created_at"),
    supabase.from("locations").select("*").eq("book_id", bookId).order("created_at"),
    supabase.from("themes").select("*").eq("book_id", bookId).order("created_at"),
    supabase.from("motifs").select("*").eq("book_id", bookId).order("created_at"),
    supabase.from("timeline_notes").select("*").eq("book_id", bookId).order("sequence_order", { ascending: true, nullsFirst: false }),
    supabase.from("chapters").select("id,chapter_number,title").eq("book_id", bookId).order("chapter_number"),
  ]);

  if (!book) {
    return (
      <Container>
        <Alert color="red">Book not found.</Alert>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <Title mb={4}>World Bible</Title>
      <Text c="dimmed" mb="xl">{book.title}</Text>
      <WorldBibleEditor
        bookId={bookId}
        initialCharacters={characters || []}
        initialLocations={locations || []}
        initialThemes={themes || []}
        initialMotifs={motifs || []}
        initialTimeline={timelineNotes || []}
        chapters={(chapters || []).map((c) => ({ id: c.id, chapter_number: c.chapter_number, title: c.title ?? null }))}
        discoveryStatus={book.world_bible_status}
        discoveryProcessed={book.world_bible_processed}
        discoveryProcessedAt={book.world_bible_processed_at}
      />
    </Container>
  );
}
