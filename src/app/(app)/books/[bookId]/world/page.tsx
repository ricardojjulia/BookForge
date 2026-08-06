import { Alert, Container, Stack, Text, Title } from "@mantine/core";
import { BookInputsManager } from "@/components/books/inputs/book-inputs-manager";
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
    { data: bible },
    { data: authorNotes },
    { data: styleSamples },
    { data: matterSections },
    { data: revisionInstructions },
  ] = await Promise.all([
    supabase
      .from("books")
      .select("id,title,author_name,genre,target_audience,point_of_view,tense,world_bible_processed,world_bible_status,world_bible_processed_at")
      .eq("id", bookId)
      .single(),
    supabase.from("characters").select("*").eq("book_id", bookId).order("created_at"),
    supabase.from("locations").select("*").eq("book_id", bookId).order("created_at"),
    supabase.from("themes").select("*").eq("book_id", bookId).order("created_at"),
    supabase.from("motifs").select("*").eq("book_id", bookId).order("created_at"),
    supabase.from("timeline_notes").select("*").eq("book_id", bookId).order("sequence_order", { ascending: true, nullsFirst: false }),
    supabase.from("chapters").select("id,chapter_number,title").eq("book_id", bookId).order("chapter_number"),
    supabase.from("book_bibles").select("content,updated_at").eq("book_id", bookId).maybeSingle(),
    supabase
      .from("author_notes")
      .select("creative_instructions,voice_guidance,worldview_notes,theological_alignment,forbidden_changes")
      .eq("book_id", bookId)
      .maybeSingle(),
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
      <Stack gap="xl">
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

        <BookInputsManager
          bookId={bookId}
          book={book}
          bible={bible}
          authorNotes={authorNotes}
          characters={characters || []}
          styleSamples={styleSamples || []}
          matterSections={matterSections || []}
          revisionInstructions={revisionInstructions || []}
        />
      </Stack>
    </Container>
  );
}
