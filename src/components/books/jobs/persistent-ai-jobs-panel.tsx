"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Group, Paper, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { getJobProgressDisplay } from "@/lib/ai/job-state";
import { fetchJson } from "@/lib/http/fetch-json";

type PersistedAiJob = {
  id: string;
  mode: string;
  status: string | null;
  settings?: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  isStale?: boolean;
  progress: {
    taskName: string;
    currentUnit: string;
    totalUnits: number;
    attempted: number;
    successful: number;
    failed: number;
    skipped: number;
    startedAt?: string | null;
    completedAt?: string | null;
    estimatedSecondsPerUnit?: number | null;
    lastHeartbeatAt?: string | null;
    message?: string | null;
    failedUnits?: Array<{ id: string; label: string; type: string; error: string }>;
  } | null;
};

type JobsResponse = {
  content?: {
    jobs: PersistedAiJob[];
  };
};

export function PersistentAiJobsPanel({ bookId }: { bookId: string }) {
  const [jobs, setJobs] = useState<PersistedAiJob[]>([]);
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const activeJob = useMemo(
    () => jobs.find((job) => ["running", "paused", "queued"].includes(job.status || "")) || jobs[0],
    [jobs],
  );

  const loadJobs = useCallback(async () => {
    try {
      const result = await fetchJson<JobsResponse>(`/api/books/${bookId}/jobs`, { cache: "no-store" }, "Load AI jobs");
      setJobs(result.content?.jobs || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load persistent AI jobs.");
    }
  }, [bookId]);

  async function controlJob(jobId: string, action: "pause" | "resume" | "cancel" | "mark_failed") {
    setLoadingAction(`${action}:${jobId}`);
    try {
      await fetchJson(
        `/api/jobs/${jobId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        },
        `${action} job`,
      );
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update job.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function retryFailed(job: PersistedAiJob) {
    const failedUnits = job.progress?.failedUnits || [];
    if (!failedUnits.length) return;
    const endpoint = retryEndpoint(bookId, job);
    if (!endpoint) {
      setError("Retry failed units is not available for this job type yet.");
      return;
    }
    setLoadingAction(`retry:${job.id}`);
    try {
      await fetchJson(
        endpoint.path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(endpoint.body),
        },
        "Retry failed units",
      );
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to retry failed units.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function resumeInterrupted(job: PersistedAiJob) {
    const endpoint = replacementEndpoint(bookId, job);
    if (!endpoint) {
      setError("Resume is not available for this job type yet.");
      return;
    }
    setLoadingAction(`resume-interrupted:${job.id}`);
    try {
      await fetchJson(
        endpoint.path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(endpoint.body),
        },
        "Resume interrupted job",
      );
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resume interrupted job.");
    } finally {
      setLoadingAction(null);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void loadJobs(), 0);
    const interval = window.setInterval(() => void loadJobs(), 2500);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadJobs]);

  return (
    <Paper withBorder radius="md" p="xl" bg="#fbfaf8">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={3}>Persistent AI Jobs</Title>
            <Text c="dimmed" size="sm">
              Durable progress for long LM Studio work. Refreshing the page will keep the latest saved counts.
            </Text>
            <Button component="a" href={`/books/${bookId}/jobs`} size="xs" variant="subtle" color="grape" mt="xs">
              Open Jobs History
            </Button>
          </div>
          <Badge color={activeJob ? statusColor(activeJob.status) : "gray"} variant="light">
            {activeJob?.status || "No jobs yet"}
          </Badge>
        </Group>

        {error && <Alert color="red">{error}</Alert>}

        {!activeJob ? (
          <Alert color="gray" variant="light">
            No persistent AI jobs have been created for this book yet.
          </Alert>
        ) : (
          <JobCard
            job={activeJob}
            loadingAction={loadingAction}
            onPause={() => controlJob(activeJob.id, "pause")}
            onResume={() => controlJob(activeJob.id, "resume")}
            onCancel={() => controlJob(activeJob.id, "cancel")}
            onMarkFailed={() => controlJob(activeJob.id, "mark_failed")}
            onRetryFailed={() => retryFailed(activeJob)}
            onResumeInterrupted={() => resumeInterrupted(activeJob)}
          />
        )}

        {jobs.length > 1 && (
          <Stack gap="xs">
            <Text fw={800} size="sm">
              Recent jobs
            </Text>
            {jobs.slice(1, 6).map((job) => (
              <Group key={job.id} justify="space-between">
                <Text size="sm">
                  {humanizeMode(job.mode)} · {new Date(job.created_at).toLocaleString()}
                </Text>
                <Badge color={statusColor(job.status)} variant="light">
                  {job.status || "unknown"}
                </Badge>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function JobCard({
  job,
  loadingAction,
  onPause,
  onResume,
  onCancel,
  onMarkFailed,
  onRetryFailed,
  onResumeInterrupted,
}: {
  job: PersistedAiJob;
  loadingAction: string | null;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onMarkFailed: () => void;
  onRetryFailed: () => void;
  onResumeInterrupted: () => void;
}) {
  const progress = job.progress;
  const { completed, total, percent } = getJobProgressDisplay(progress, job.status);
  const eta = getEta(job);
  const stale = Boolean(job.isStale);
  const failedUnits = progress?.failedUnits || [];

  return (
    <Paper withBorder radius="md" p="lg" bg="white">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={900}>{progress?.taskName || humanizeMode(job.mode)}</Text>
            <Text c="dimmed" size="sm">
              {progress?.currentUnit || "Waiting for progress update"}
            </Text>
          </div>
          <Badge color={stale ? "orange" : statusColor(job.status)}>
            {stale ? "possibly interrupted" : job.status || "unknown"}
          </Badge>
        </Group>

        <Progress value={percent} color="grape" radius="xl" size="lg" />

        <SimpleGrid cols={{ base: 2, md: 5 }}>
          <Metric label="Progress" value={`${completed}/${total}`} />
          <Metric label="Successful" value={progress?.successful || 0} />
          <Metric label="Skipped" value={progress?.skipped || 0} />
          <Metric label="Failed" value={progress?.failed || 0} />
          <Metric label="ETA" value={eta} />
        </SimpleGrid>

        {progress?.message && <Alert color="blue" variant="light">{progress.message}</Alert>}
        {stale && (
          <Alert color="orange" variant="light">
            This job has not saved a heartbeat recently. The server may have been refreshed, LM Studio may be stalled,
            or the request may have been interrupted. Mark it failed or cancel it before starting a replacement run.
          </Alert>
        )}
        {failedUnits.length > 0 && (
          <Alert color="red" variant="light">
            <Text fw={800} size="sm">
              Failed units
            </Text>
            {failedUnits.slice(0, 3).map((unit) => (
              <Text key={`${unit.type}:${unit.id}`} size="sm">
                {unit.label}: {unit.error}
              </Text>
            ))}
          </Alert>
        )}
        {job.error_message && <Alert color="red">{job.error_message}</Alert>}

        <Group>
          <Button
            variant="light"
            color="yellow"
            disabled={job.status !== "running"}
            loading={loadingAction === `pause:${job.id}`}
            onClick={onPause}
          >
            Pause
          </Button>
          <Button
            variant="light"
            color="green"
            disabled={job.status !== "paused"}
            loading={loadingAction === `resume:${job.id}`}
            onClick={onResume}
          >
            Resume
          </Button>
          <Button
            variant="outline"
            color="red"
            disabled={!["running", "paused", "queued"].includes(job.status || "")}
            loading={loadingAction === `cancel:${job.id}`}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            color="orange"
            disabled={!stale}
            loading={loadingAction === `mark_failed:${job.id}`}
            onClick={onMarkFailed}
          >
            Mark failed
          </Button>
          <Button
            variant="light"
            color="orange"
            disabled={!stale}
            loading={loadingAction === `resume-interrupted:${job.id}`}
            onClick={onResumeInterrupted}
          >
            Resume replacement run
          </Button>
          <Button
            variant="light"
            color="grape"
            disabled={!failedUnits.length}
            loading={loadingAction === `retry:${job.id}`}
            onClick={onRetryFailed}
          >
            Retry failed only
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function retryEndpoint(bookId: string, job: PersistedAiJob) {
  if (job.mode === "full_book_rewrite") {
    return { path: `/api/books/${bookId}/rewrite-execute`, body: { retryJobId: job.id } };
  }
  if (job.mode === "chapter_summaries") {
    return { path: `/api/books/${bookId}/chapters/summarize`, body: { retryJobId: job.id } };
  }
  if (job.mode === "bookforge_critic" || job.mode === "bookforge_critic_batch") {
    const lens = job.progress?.failedUnits?.find((unit) => unit.type === "critic_lens")?.id;
    if (lens) return { path: `/api/books/${bookId}/critic`, body: { lens } };
  }
  if (job.mode === "manuscript_blueprint") {
    return { path: `/api/books/${bookId}/analyze`, body: { retryJobId: job.id } };
  }
  return null;
}

function replacementEndpoint(bookId: string, job: PersistedAiJob) {
  if (job.mode === "full_book_rewrite") return { path: `/api/books/${bookId}/rewrite-execute`, body: {} };
  if (job.mode === "chapter_summaries") return { path: `/api/books/${bookId}/chapters/summarize`, body: {} };
  if (job.mode === "manuscript_blueprint") return { path: `/api/books/${bookId}/analyze`, body: {} };
  if (job.mode === "bookforge_critic_batch") {
    return { path: `/api/books/${bookId}/critic/all`, body: { stage: stringSetting(job.settings, "stage") || "post_rewrite" } };
  }
  if (job.mode === "bookforge_critic") {
    const lens = stringSetting(job.settings, "lens");
    if (lens) return { path: `/api/books/${bookId}/critic`, body: { lens, stage: stringSetting(job.settings, "stage") || "baseline" } };
  }
  return null;
}

function stringSetting(settings: Record<string, unknown> | null | undefined, key: string) {
  const value = settings?.[key];
  return typeof value === "string" ? value : "";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Paper withBorder radius="md" p="sm" bg="gray.0">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={900}>{value}</Text>
    </Paper>
  );
}

function getEta(job: PersistedAiJob) {
  const progress = job.progress;
  if (!progress || job.status !== "running" || !progress.startedAt) return "—";
  const completed = Math.max(progress.attempted, progress.successful + progress.failed);
  if (completed < 2) return "learning";
  const elapsed = (Date.now() - new Date(progress.startedAt).getTime()) / 1000;
  const secondsPerUnit = elapsed / completed;
  const remaining = Math.max(0, progress.totalUnits - completed);
  return formatDuration(Math.ceil(remaining * secondsPerUnit));
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
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
