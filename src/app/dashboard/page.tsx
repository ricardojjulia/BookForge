import { Alert, Badge, Button, Container, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { DeleteBookButton } from "@/components/books/delete-book-button";
import { DashboardMetrics } from "@/components/dashboard/dashboard-metrics";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { AppShell } from "@/components/layout/app-shell";
import { getBookAuthorDisplay } from "@/lib/books/status";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

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

  const [{ data: books }, { data: bookOptions }, { count: bookCount }, { count: reportCount }, { data: userSettings }] = await Promise.all([
    supabase
      .from("books")
      .select("id,title,author_name,genre,status,finished_export_id,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("books").select("id,title").order("title"),
    supabase.from("books").select("id", { count: "exact", head: true }),
    supabase
      .from("coherence_reports")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("user_settings")
      .select("onboarding_completed_steps, primary_rewrite_model, llm_api_key_secret_id, llm_provider, execution_mode")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const finishedExportIds = (books || [])
    .map((b) => (b as { finished_export_id?: string | null }).finished_export_id)
    .filter(Boolean) as string[];
  const finishedExports = finishedExportIds.length
    ? await Promise.all(
        finishedExportIds.map(async (exportId) => {
          const { data } = await supabase.from("exports").select("id,format,storage_path,book_id").eq("id", exportId).single();
          if (!data?.storage_path) return { exportId, format: data?.format || "", bookId: data?.book_id || "" };
          return { exportId, format: data.format, bookId: data.book_id };
        }),
      )
    : [];
  const finishedByBook = Object.fromEntries(finishedExports.map((fe) => [fe.bookId, fe]));
  const freshnessFetchedAt = new Date().toISOString();
  const settings = userSettings as {
    onboarding_completed_steps?: string[];
    execution_mode?: string;
    primary_rewrite_model?: string;
    llm_provider?: string;
    llm_api_key_secret_id?: string;
  } | null;
  const completedSteps = settings?.onboarding_completed_steps ?? [];
  const hasLmStudio = settings?.execution_mode === "local" || Boolean(settings?.primary_rewrite_model);
  const hasCloud = Boolean(settings?.llm_api_key_secret_id);
  const needsSetup = !hasLmStudio && !hasCloud;
  const providerLabels: Record<string, string> = {
    openrouter: "OpenRouter",
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google Gemini",
  };
  const aiEngine = hasCloud
    ? providerLabels[settings?.llm_provider ?? ""] ?? "Cloud provider"
    : hasLmStudio
      ? "LM Studio"
      : "Not configured";

  return (
    <AppShell>
      <Container size="xl">
        <DataFreshnessBanner routeKey="dashboard" fetchedAt={freshnessFetchedAt} label="Dashboard data" />
        <Group justify="space-between" mb="xl">
          <div>
            <Title>Author Dashboard</Title>
            <Text c="dimmed">Projects, books, revision progress, and recent critic activity.</Text>
          </div>
          <Group>
            {needsSetup && <SetupWizard userId={user.id} completedSteps={completedSteps} needsSetup />}
            <Button component="a" href="/books/create" color="grape">
              Create From Idea
            </Button>
            <Button component="a" href="/books/new" color="dark" variant="light">
              Import Manuscript
            </Button>
          </Group>
        </Group>

        <DashboardMetrics
          bookCount={bookCount ?? 0}
          reportCount={reportCount ?? 0}
          aiEngine={aiEngine}
          books={bookOptions || []}
        />

        <SimpleGrid id="books" cols={{ base: 1, md: 3 }} style={{ scrollMarginTop: 24 }}>
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
                  <Text size="xs" c="dimmed">
                    Created {new Date(book.created_at).toLocaleDateString()} · Updated{" "}
                    {new Date(book.updated_at).toLocaleDateString()}
                  </Text>
                  {isFinished && finishedExport && (
                    <Button
                      component="a"
                      href={`/api/books/${book.id}/exports/${finishedExport.exportId}/download`}
                      target="_blank"
                      rel="noreferrer"
                      color="green"
                      leftSection={<span>↓</span>}
                    >
                      Download {finishedExport.format.toUpperCase()}
                    </Button>
                  )}
                  {isFinished && (
                    <Button component="a" href={`/books/${book.id}/publishing-lab`} color="orange" variant="light">
                      Publishing Lab
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
