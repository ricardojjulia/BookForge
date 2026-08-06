import { Alert, Container, Title } from "@mantine/core";
import { GuidanceWorkflowPanel } from "@/components/books/guidance/guidance-workflow-panel";
import { getBookCriticReports } from "@/lib/books/book-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GuidancePage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase before opening guidance.</Alert>
      </Container>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const { reports } = await getBookCriticReports(supabase, bookId);

  return (
    <Container size="xl">
      <Title mb="xl">Guidance</Title>
      <GuidanceWorkflowPanel bookId={bookId} reports={reports} />
    </Container>
  );
}
