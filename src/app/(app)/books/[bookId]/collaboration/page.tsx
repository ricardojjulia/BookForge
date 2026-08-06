import { Alert, Container, Paper, Stack, Title } from "@mantine/core";
import { BookChatRail } from "@/components/books/chat/book-chat-rail";
import { CollaborationPanel } from "@/components/books/collaboration-panel";
import { BookMetadataTimelinePanel } from "@/components/books/metadata/book-metadata-timeline-panel";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function CollaborationPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase before opening collaboration tools.</Alert>
      </Container>
    );
  }

  const { bookId } = await params;

  return (
    <Container size="xl">
      <Title mb="xl">Collaboration</Title>
      <Stack gap="xl">
        <BookChatRail bookId={bookId} />
        <BookMetadataTimelinePanel bookId={bookId} />
        <Paper withBorder radius="md" p="xl" bg="white">
          <Title order={2} mb="md">
            Reviewers
          </Title>
          <CollaborationPanel bookId={bookId} />
        </Paper>
      </Stack>
    </Container>
  );
}
