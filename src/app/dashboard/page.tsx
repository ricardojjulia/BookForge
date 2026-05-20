import { Alert, Badge, Button, Container, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { DeleteBookButton } from "@/components/books/delete-book-button";
import { AppShell } from "@/components/layout/app-shell";
import { getBookAuthorDisplay } from "@/lib/books/status";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!hasSupabaseEnv()) {
    return <SetupNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell>
        <Container size="lg">
          <Alert color="grape" title="Login required">
            Connect Supabase and sign in to create projects and import manuscripts.
          </Alert>
        </Container>
      </AppShell>
    );
  }

  const [{ data: books }, { data: reports }] = await Promise.all([
    supabase
      .from("books")
      .select("id,title,author_name,genre,status,finished_export_id,created_at")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("coherence_reports")
      .select("id,book_id,report_type,created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const finishedExportIds = (books || [])
    .map((b) => (b as { finished_export_id?: string | null }).finished_export_id)
    .filter(Boolean) as string[];
  const finishedExports = finishedExportIds.length
    ? await Promise.all(
        finishedExportIds.map(async (exportId) => {
          const { data } = await supabase.from("exports").select("id,format,storage_path,book_id").eq("id", exportId).single();
          if (!data?.storage_path) return { exportId, format: data?.format || "", signedUrl: null, bookId: data?.book_id || "" };
          const { data: signed } = await supabase.storage.from("exports").createSignedUrl(data.storage_path, 60 * 10);
          return { exportId, format: data.format, signedUrl: signed?.signedUrl || null, bookId: data.book_id };
        }),
      )
    : [];
  const finishedByBook = Object.fromEntries(finishedExports.map((fe) => [fe.bookId, fe]));

  return (
    <AppShell>
      <Container size="xl">
        <Group justify="space-between" mb="xl">
          <div>
            <Title>Author Dashboard</Title>
            <Text c="dimmed">Projects, books, revision progress, and recent critic activity.</Text>
          </div>
          <Group>
            <Button component="a" href="/books/create" color="grape">
              Create From Idea
            </Button>
            <Button component="a" href="/books/new" color="dark" variant="light">
              Import Manuscript
            </Button>
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 3 }} mb="xl">
          <Metric label="Books" value={books?.length || 0} />
          <Metric label="Critic reports" value={reports?.length || 0} />
          <Metric label="AI engine" value="LM Studio" />
        </SimpleGrid>

        <Paper withBorder radius="md" p="xl" bg="#fbfaf8" mb="xl">
          <Group justify="space-between" align="flex-start">
            <div>
              <Badge color="grape" variant="light" mb="xs">
                New
              </Badge>
              <Title order={2}>Create a Book From an Idea</Title>
              <Text c="dimmed" maw={760}>
                Start with a prompt, build the theme, chapter architecture, characters or teaching framework, then generate a bounded first draft with local LM Studio models.
              </Text>
            </div>
            <Button component="a" href="/books/create" color="grape">
              Start Creation Wizard
            </Button>
          </Group>
        </Paper>

        <SimpleGrid cols={{ base: 1, md: 3 }}>
          {books?.map((book) => {
            const isFinished = book.status === "finished";
            const finishedExport = finishedByBook[book.id];
            return (
              <Paper
                key={book.id}
                withBorder
                radius="md"
                p="lg"
                bg={isFinished ? "#f0faf4" : "white"}
                style={isFinished ? { borderColor: "var(--mantine-color-green-4)" } : undefined}
              >
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Badge color={isFinished ? "green" : "grape"} variant={isFinished ? "filled" : "light"}>
                      {isFinished ? "FINISHED" : (book.status || "draft")}
                    </Badge>
                    <Badge color="teal" variant="outline">
                      {book.genre || "Manuscript"}
                    </Badge>
                  </Group>
                  <Title order={3}>{book.title}</Title>
                  <Text c="dimmed">{getBookAuthorDisplay(book)}</Text>
                  {isFinished && finishedExport?.signedUrl && (
                    <Button
                      component="a"
                      href={finishedExport.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      color="green"
                      leftSection={<span>↓</span>}
                    >
                      Download {finishedExport.format.toUpperCase()}
                    </Button>
                  )}
                  <Group mt={isFinished ? "xs" : "sm"}>
                    <Button component="a" href={`/books/${book.id}`} variant={isFinished ? "subtle" : "light"} color="grape">
                      {isFinished ? "Continue editing" : "Continue Editing"}
                    </Button>
                    <DeleteBookButton bookId={book.id} bookTitle={book.title} size="sm" />
                  </Group>
                </Stack>
              </Paper>
            );
          })}
        </SimpleGrid>

        {!books?.length && (
          <Paper withBorder radius="md" p="xl" bg="white">
            <Title order={3}>No books yet</Title>
            <Text c="dimmed" mb="md">
              Import a .txt, .md, or .docx manuscript to create the first structured project.
            </Text>
            <Button component="a" href="/books/new" color="grape">
              Import Manuscript
            </Button>
          </Paper>
        )}
      </Container>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Paper withBorder radius="md" p="lg" bg="white">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Title order={2}>{value}</Title>
    </Paper>
  );
}

function SetupNotice() {
  return (
    <AppShell>
      <Container size="lg">
        <Alert color="yellow" title="Supabase environment is not configured">
          Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`.
        </Alert>
      </Container>
    </AppShell>
  );
}
