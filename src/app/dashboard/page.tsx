import { Alert, Badge, Button, Container, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { DeleteBookButton } from "@/components/books/delete-book-button";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
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

  const [{ data: books }, { data: reports }, { data: userSettings }] = await Promise.all([
    supabase
      .from("books")
      .select("id,title,author_name,genre,status,finished_export_id,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("coherence_reports")
      .select("id,book_id,report_type,created_at")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("user_settings")
      .select("onboarding_completed_steps, primary_rewrite_model, llm_api_key_secret_id, llm_provider")
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
          if (!data?.storage_path) return { exportId, format: data?.format || "", signedUrl: null, bookId: data?.book_id || "" };
          const { data: signed } = await supabase.storage.from("exports").createSignedUrl(data.storage_path, 60 * 10);
          return { exportId, format: data.format, signedUrl: signed?.signedUrl || null, bookId: data.book_id };
        }),
      )
    : [];
  const finishedByBook = Object.fromEntries(finishedExports.map((fe) => [fe.bookId, fe]));
  const freshnessFetchedAt = new Date().toISOString();

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
            {(() => {
              const s = userSettings as { onboarding_completed_steps?: string[]; primary_rewrite_model?: string; llm_api_key_secret_id?: string } | null;
              const completedSteps = s?.onboarding_completed_steps ?? [];
              const hasLmStudio = Boolean(s?.primary_rewrite_model);
              const hasCloud = Boolean(s?.llm_api_key_secret_id);
              const needsSetup = !hasLmStudio && !hasCloud;
              return (
                <SetupWizard
                  userId={user.id}
                  completedSteps={completedSteps}
                  needsSetup={needsSetup}
                />
              );
            })()}
            <Button component="a" href="/books/create" color="grape">
              Create From Idea
            </Button>
            <Button component="a" href="/books/new" color="dark" variant="light">
              Import Manuscript
            </Button>
          </Group>
        </Group>

        <OnboardingChecklist completedSteps={(userSettings as { onboarding_completed_steps?: string[] } | null)?.onboarding_completed_steps || []} />

        <SimpleGrid cols={{ base: 1, md: 3 }} mb="xl">
          <Metric label="Books" value={books?.length || 0} />
          <Metric label="Critic reports" value={reports?.length || 0} />
          {(() => {
            const s = userSettings as { llm_provider?: string; llm_api_key_secret_id?: string } | null;
            const provider = s?.llm_api_key_secret_id ? (s.llm_provider ?? "cloud") : "lmstudio";
            const labels: Record<string, string> = { lmstudio: "LM Studio", openai: "OpenAI", anthropic: "Anthropic", google: "Google Gemini" };
            return <Metric label="AI engine" value={labels[provider] ?? "LM Studio"} />;
          })()}
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
                  <Text size="xs" c="dimmed">
                    Created {new Date(book.created_at).toLocaleDateString()} · Updated{" "}
                    {new Date(book.updated_at).toLocaleDateString()}
                  </Text>
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
