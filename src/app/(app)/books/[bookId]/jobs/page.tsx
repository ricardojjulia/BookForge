import Link from "next/link";
import { Alert, Badge, Button, Container, Group, Paper, Progress, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { SelectedJobFocus } from "@/components/books/jobs/selected-job-focus";
import { extractJobProgress, getJobProgressDisplay, isStaleRunningJob, summarizeRevisionJobs } from "@/lib/ai/job-state";
import { getBookCore } from "@/lib/books/book-data";
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
  progress?: ReturnType<typeof extractJobProgress>;
};

export default async function JobsHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase before opening jobs history.</Alert>
      </Container>
    );
  }

  const [{ bookId }, query] = await Promise.all([params, searchParams]);
  const selectedJobId = typeof query?.job === "string" ? query.job.trim() : "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Container size="lg">
        <Alert color="grape" title="Login required">
          Sign in to view persistent AI job history for this book.
        </Alert>
      </Container>
    );
  }

  const [{ data: book }, { data: jobs, error }] = await Promise.all([
    getBookCore(supabase, bookId),
    supabase
      .from("revision_jobs")
      .select("id,mode,status,settings,error_message,created_at,started_at,completed_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (error) {
    return (
      <Container>
        <Alert color="red">Unable to load jobs history.</Alert>
      </Container>
    );
  }

  const jobRows = ((jobs || []) as JobRow[]).map((job) => ({
    ...job,
    progress: extractJobProgress(job.settings),
  }));
  const summary = summarizeRevisionJobs(jobRows);
  const sortedJobs = [...jobRows].sort((a, b) => {
    const rankDiff = jobRank(a.status) - jobRank(b.status);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const staleRunningJob = sortedJobs.find((job) => isStaleRunningJob(job.status, job.progress || null));
  const activeJob = sortedJobs.find((job) => job.status === "running" || job.status === "paused" || job.status === "queued");

  return (
    <Container size="xl">
      {selectedJobId ? <SelectedJobFocus jobId={selectedJobId} /> : null}
      <Group justify="space-between" mb="xl" align="flex-start">
        <div>
          <Title>AI Jobs History</Title>
          <Text c="dimmed">{book?.title || "Book"} · persistent AI workflow records</Text>
        </div>
        <Group>
          <Link href={`/books/${bookId}/revisions`} style={{ textDecoration: "none" }}>
            <Button variant="light" color="teal">
              Review Revisions
            </Button>
          </Link>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} mb="xl">
        <MetricCard label="Total jobs" value={summary.total} tone="gray" />
        <MetricCard label="Active" value={summary.active} tone="grape" />
        <MetricCard label="Stale running" value={summary.staleRunning} tone="orange" />
        <MetricCard label="Failed" value={summary.failed} tone="red" />
      </SimpleGrid>

      {staleRunningJob ? (
        <Alert color="orange" mb="md" title="Long-running job visibility">
          <Text size="sm">
            {staleRunningJob.progress?.taskName || humanizeMode(staleRunningJob.mode)} has not sent a heartbeat in a
            while. Last unit: {staleRunningJob.progress?.currentUnit || "unknown"}. Check the AI provider status, mark
            the job failed, or start a replacement run if this one is stalled.
          </Text>
        </Alert>
      ) : activeJob ? (
        <Alert color="blue" mb="md" title="Most recent active job">
          <Text size="sm">
            {activeJob.progress?.taskName || humanizeMode(activeJob.mode)} is {activeJob.status || "unknown"} and
            remains visible above completed history.
          </Text>
        </Alert>
      ) : null}

      <Paper withBorder radius="md" p="xl" bg="white">
        {!sortedJobs.length ? (
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
              {sortedJobs.map((job) => {
                const { completed, total, percent } = getJobProgressDisplay(job.progress || null, job.status);
                const stale = isStaleRunningJob(job.status, job.progress || null);
                const isSelected = Boolean(selectedJobId) && selectedJobId === job.id;
                return (
                  <tr
                    key={job.id}
                    data-job-id={job.id}
                    tabIndex={isSelected ? -1 : undefined}
                    aria-selected={isSelected}
                    style={isSelected ? { backgroundColor: "#f5f7ff" } : undefined}
                  >
                    <td>
                      <Stack gap={2}>
                        <Group gap={6}>
                          <Text fw={800}>{job.progress?.taskName || humanizeMode(job.mode)}</Text>
                          {isSelected && (
                            <Badge size="xs" color="blue" variant="light">
                              selected
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {job.progress?.currentUnit || job.id}
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
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" c="green">{job.progress?.successful || 0} ok</Text>
                        <Text size="sm" c="dimmed">·</Text>
                        <Text size="sm" c={job.progress?.skipped ? "yellow.8" : "dimmed"}>{job.progress?.skipped || 0} skipped</Text>
                        <Text size="sm" c="dimmed">·</Text>
                        <Text size="sm" c={job.progress?.failed ? "red" : "dimmed"}>{job.progress?.failed || 0} failed</Text>
                      </Group>
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
  );
}

function statusColor(status: string | null) {
  if (status === "completed") return "green";
  if (status === "running") return "grape";
  if (status === "paused") return "yellow";
  if (status === "failed" || status === "cancelled") return "red";
  return "gray";
}

function jobRank(status: string | null) {
  if (status === "running") return 0;
  if (status === "paused") return 1;
  if (status === "queued") return 2;
  if (status === "failed") return 3;
  if (status === "cancelled") return 4;
  if (status === "completed") return 5;
  return 6;
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Paper withBorder radius="md" p="md" bg="white">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={900} c={tone} fz={24}>
        {value}
      </Text>
    </Paper>
  );
}

function humanizeMode(mode: string) {
  return mode.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
