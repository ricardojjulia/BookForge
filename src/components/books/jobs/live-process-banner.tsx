"use client";

import { useCallback, useMemo, useState } from "react";
import { Alert, Badge, Button, Group, Progress, Stack, Text } from "@mantine/core";
import { useAdaptivePolling } from "@/lib/hooks/use-adaptive-polling";
import { fetchJson } from "@/lib/http/fetch-json";
import { getJobProgressDisplay } from "@/lib/ai/job-state";

type PersistedAiJob = {
  id: string;
  mode: string;
  status: string | null;
  progress?: {
    taskName?: string;
    currentUnit?: string;
    totalUnits?: number;
    attempted?: number;
    successful?: number;
    failed?: number;
  } | null;
};

type JobsResponse = {
  content?: {
    jobs: PersistedAiJob[];
  };
};

type AutoReviewJob = {
  id: string;
  status?: string | null;
  current_stage?: string | null;
  mode?: string | null;
};

type AutoReviewResponse = {
  job?: AutoReviewJob | null;
};

const ACTIVE_POLL_MS = 4000;
const IDLE_POLL_MS = 30000;

export function LiveProcessBanner({ bookId }: { bookId: string }) {
  const [activeJob, setActiveJob] = useState<PersistedAiJob | null>(null);
  const [activeAutoReview, setActiveAutoReview] = useState<AutoReviewJob | null>(null);

  const loadLiveStatus = useCallback(async () => {
    try {
      const [jobsResult, autoReviewResult] = await Promise.all([
        fetchJson<JobsResponse>(`/api/books/${bookId}/jobs`, { cache: "no-store" }, "Load AI jobs"),
        fetchJson<AutoReviewResponse>(`/api/books/${bookId}/auto-review`, { cache: "no-store" }, "Load auto-review status"),
      ]);

      const jobs = jobsResult.content?.jobs || [];
      const nextActiveJob = jobs.find((job) => ["running", "paused", "queued"].includes(job.status || "")) || null;
      const job = autoReviewResult.job;
      const nextActiveAutoReview = job && ["running", "queued", "paused"].includes(String(job.status || "")) ? job : null;

      setActiveJob(nextActiveJob);
      setActiveAutoReview(nextActiveAutoReview);

      return Boolean(nextActiveJob || nextActiveAutoReview);
    } catch {
      // Silent fallback. The banner is additive and should not block the page.
      setActiveJob(null);
      setActiveAutoReview(null);
      return false;
    }
  }, [bookId]);

  useAdaptivePolling(loadLiveStatus, {
    activeIntervalMs: ACTIVE_POLL_MS,
    idleIntervalMs: IDLE_POLL_MS,
    pauseWhenHidden: true,
    coordinatorKey: `live-process:${bookId}`,
  });

  const hasActiveWork = Boolean(activeJob || activeAutoReview);
  const statusColor = useMemo(() => {
    if (activeAutoReview?.status === "running" || activeJob?.status === "running") return "grape";
    if (activeAutoReview?.status === "paused" || activeJob?.status === "paused") return "yellow";
    if (activeAutoReview?.status === "queued" || activeJob?.status === "queued") return "blue";
    return "gray";
  }, [activeAutoReview, activeJob]);

  if (!hasActiveWork) return null;

  const progress = activeJob?.progress;
  const { percent } = getJobProgressDisplay(
    {
      totalUnits: progress?.totalUnits || 0,
      attempted: progress?.attempted || 0,
      successful: progress?.successful || 0,
      failed: progress?.failed || 0,
    },
    activeJob?.status,
  );
  const hasMeasurableProgress = Boolean(progress?.totalUnits);

  return (
    <Alert color={statusColor} variant="light" mb="md" title="Live Processing">
      <Stack gap="xs">
        <Group justify="space-between" align="center" wrap="wrap">
          <div>
            {activeAutoReview ? (
              <Text size="sm">
                Auto-review is <b>{activeAutoReview.status || "running"}</b>
                {activeAutoReview.current_stage ? ` · stage: ${activeAutoReview.current_stage}` : ""}
              </Text>
            ) : null}
            {activeJob ? (
              <Text size="sm">
                AI job is <b>{activeJob.status || "running"}</b>
                {activeJob.progress?.taskName ? ` · ${activeJob.progress.taskName}` : ""}
                {activeJob.progress?.currentUnit ? ` · ${activeJob.progress.currentUnit}` : ""}
              </Text>
            ) : null}
          </div>
          <Group gap="xs">
            <Badge color={statusColor} variant="filled">
              Running
            </Badge>
            <Button component="a" href="#persistent-ai-jobs" size="xs" variant="white" color={statusColor}>
              View Progress
            </Button>
          </Group>
        </Group>
        {hasMeasurableProgress && (
          <Progress.Root size="lg">
            <Progress.Section value={percent} color={statusColor}>
              <Progress.Label>{percent}%</Progress.Label>
            </Progress.Section>
          </Progress.Root>
        )}
      </Stack>
    </Alert>
  );
}
