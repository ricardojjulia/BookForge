import { Alert, Container, Text, Title } from "@mantine/core";
import { SeriesBibleEditor } from "@/components/series/series-bible-editor";
import { getSeriesSharedEntities } from "@/lib/series/shared-entities";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SeriesBiblePage({ params }: { params: Promise<{ seriesId: string }> }) {
  if (!hasSupabaseEnv()) {
    return <Container><Alert color="yellow">Configure Supabase.</Alert></Container>;
  }

  const { seriesId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <Container><Alert color="grape" title="Login required">Sign in.</Alert></Container>;

  const [{ data: series }, { data: notes }, { data: books }, sharedEntities] = await Promise.all([
    supabase.from("series").select("id,title,description").eq("id", seriesId).eq("owner_id", user.id).single(),
    supabase.from("series_notes").select("*").eq("series_id", seriesId).order("note_type").order("created_at"),
    supabase.from("books").select("id,title,series_order,status").eq("series_id", seriesId).order("series_order", { ascending: true, nullsFirst: false }),
    getSeriesSharedEntities(supabase, seriesId),
  ]);

  if (!series) {
    return <Container><Alert color="red">Series not found.</Alert></Container>;
  }

  return (
    <Container size="xl">
      <Title mb={4}>{series.title} — Series Bible</Title>
      {series.description && <Text c="dimmed" mb="xl">{series.description}</Text>}
      <SeriesBibleEditor
        seriesId={seriesId}
        initialNotes={notes || []}
        books={(books || []).map((b) => ({ id: b.id, title: b.title, series_order: b.series_order, status: b.status }))}
        initialSharedEntities={sharedEntities}
      />
    </Container>
  );
}
