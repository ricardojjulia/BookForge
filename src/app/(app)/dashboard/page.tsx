import { Alert, Button, Container, Group, Paper, Text, Title } from "@mantine/core";
import { BookRow } from "@/components/dashboard/book-row";
import { DashboardMetrics } from "@/components/dashboard/dashboard-metrics";
import { DataFreshnessBanner } from "@/components/layout/data-freshness-banner";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
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
      <Container size="lg">
        <Alert color="grape" title="Login required">
          Connect Supabase and sign in to create projects and import manuscripts.
        </Alert>
      </Container>
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
  // execution_mode is the actual source of truth for which engine a call
  // will use -- llm_api_key_secret_id merely means a cloud key was saved at
  // some point and is never cleared on switching modes, so checking "does a
  // cloud key exist" instead of "what mode is active" showed the cloud
  // provider forever even after the user explicitly switched to local.
  const cloudLabel = providerLabels[settings?.llm_provider ?? ""] ?? "Cloud provider";
  const aiEngine =
    settings?.execution_mode === "local"
      ? "LM Studio"
      : settings?.execution_mode === "cloud"
        ? hasCloud
          ? cloudLabel
          : "Not configured"
        : settings?.execution_mode === "auto"
          ? hasCloud && hasLmStudio
            ? `Auto (${cloudLabel} + LM Studio)`
            : hasCloud
              ? cloudLabel
              : hasLmStudio
                ? "LM Studio"
                : "Not configured"
          : hasCloud
            ? cloudLabel
            : hasLmStudio
              ? "LM Studio"
              : "Not configured";

  return (
    <Container size="xl">
      <DataFreshnessBanner routeKey="dashboard" fetchedAt={freshnessFetchedAt} label="Dashboard data" variant="subtle" />
      <Group justify="space-between" align="flex-start" mb={8} wrap="wrap">
        <div>
          <Title style={{ fontSize: 28, letterSpacing: "-0.01em" }}>My Book Room</Title>
          <Text mt={6} style={{ fontSize: 14, color: "oklch(0.5 0.005 90)" }}>
            Projects, books, revision progress, and recent critic activity.
          </Text>
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

      <div id="books" style={{ scrollMarginTop: 24 }}>
        {books?.map((book) => (
          <BookRow key={book.id} book={book} finishedExport={finishedByBook[book.id]} />
        ))}
      </div>

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
  );
}

function SetupNotice() {
  return (
    <Container size="lg">
      <Alert color="yellow" title="Supabase environment is not configured">
        Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`.
      </Alert>
    </Container>
  );
}
