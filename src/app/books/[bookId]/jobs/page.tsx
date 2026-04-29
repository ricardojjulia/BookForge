import Link from "next/link";
import { Alert, Badge, Button, Container, Group, Paper, Progress, Stack, Table, Text, Title } from "@mantine/core";
import { AppShell } from "@/components/layout/app-shell";
import { extractJobProgress, getJobProgressDisplay, isStaleRunningJob } from "@/lib/ai/job-state";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  mode: string;
  status: string | null;
  settings: unknown;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export default async function JobsHistoryPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container>
          <Alert color="yellow">Configure Supabase before opening jobs history.</Alert>
        </Container>
      </AppShell>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [{ data: book }, { data: jobs, error }] = await Promise.all([
    supabase.from("books").select("title").eq("id", bookId).single(),
    supabase
      .from("revision_jobs")
      .select("id,mode,status,settings,error_message,created_at,started_at,completed_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (error) {
    return (
      <AppShell>
        <Container>
          <Alert color="red">Unable to load jobs history.</Alert>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container size="xl">
        <Group justify="space-between" mb="xl" align="flex-start">
          <div>
            <Title>AI Jobs History</Title>
            <Text c="dimmed">{book?.title || "Book"} · persistent LM Studio workflow records</Text>
          </div>
          <Group>
            <Link href={`/books/${bookId}`} style={{ textDecoration: "none" }}>
              <Button variant="light" color="dark">
                Back to Book
              </Button>
            </Link>
            <Link href={`/books/${bookId}/revisions`} style={{ textDecoration: "none" }}>
              <Button variant="light" color="teal">
                Review Revisions
              </Button>
            </Link>
          </Group>
        </Group>

        <Paper withBorder radius="md" p="xl" bg="white">
          {!jobs?.length ? (
            <Alert color="gray">No AI jobs have been created for this book yet.</Alert>
          ) : (
            <Table striped highlightOnHover>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Counts</th>
                  <th>Created</th>
                  <th>Links</th>
                </tr>
              </thead>
              <tbody>
                {(jobs as JobRow[]).map((job) => {
                  const progress = extractJobProgress(job.settings);
                  const { completed, total, percent } = getJobProgressDisplay(progress, job.status);
                  const stale = isStaleRunningJob(job.status, progress);
                  return (
                    <tr key={job.id}>
                      <td>
                        <Stack gap={2}>
                          <Text fw={800}>{progress?.taskName || humanizeMode(job.mode)}</Text>
                          <Text size="xs" c="dimmed">
                            {progress?.currentUnit || job.id}
                          </Text>
                        </Stack>
                      </td>
                      <td>
                        <Badge color={stale ? "orange" : statusColor(job.status)}>
                          {stale ? "possibly interrupted" : job.status || "unknown"}
                        </Badge>
                      </td>
                      <td style={{ minWidth: 180 }}>
                        <Progress value={percent} color="grape" radius="xl" />
                        <Text size="xs" c="dimmed" mt={4}>
                          {completed}/{total}
                        </Text>
                      </td>
                      <td>
                        <Text size="sm">OK {progress?.successful || 0}</Text>
                        <Text size="sm">Skipped {progress?.skipped || 0}</Text>
                        <Text size="sm">Failed {progress?.failed || 0}</Text>
                      </td>
                      <td>
                        <Text size="sm">{new Date(job.created_at).toLocaleString()}</Text>
                        {job.completed_at && (
                          <Text size="xs" c="dimmed">
                            Done {new Date(job.completed_at).toLocaleString()}
                          </Text>
                        )}
                      </td>
                      <td>
                        <Stack gap={4}>
                          {job.mode === "full_book_rewrite" && (
                            <Link href={`/books/${bookId}/revisions?job=${job.id}`}>
                              Revisions
                            </Link>
                          )}
                          {(job.mode.includes("critic") || job.mode === "manuscript_blueprint") && (
                            <Link href={`/books/${bookId}`}>
                              Reports
                            </Link>
                          )}
                          {job.error_message && (
                            <Text size="xs" c="red">
                              {job.error_message}
                            </Text>
                          )}
                        </Stack>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Paper>
      </Container>
    </AppShell>
  );
}

function statusColor(status: string | null) {
  if (status === "completed") return "green";
  if (status === "running") return "grape";
  if (status === "paused") return "yellow";
  if (status === "failed" || status === "cancelled") return "red";
  return "gray";
}

function humanizeMode(mode: string) {
  return mode.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
