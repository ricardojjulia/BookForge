"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ActionIcon, Indicator, Loader, Popover, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconActivity } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { getJobProgressDisplay } from "@/lib/ai/job-state";
import { fetchJson } from "@/lib/http/fetch-json";
import { useAdaptivePolling } from "@/lib/hooks/use-adaptive-polling";

const ACTIVE_POLL_MS = 5000;
const IDLE_POLL_MS = 45000;
const ACTIVE_STATUSES = new Set(["queued", "running", "paused"]);

const MODE_LABELS: Record<string, string> = {
  rewrite_plan: "Rewrite Plan",
  full_book_rewrite: "Full-Book Rewrite",
  bookforge_critic: "Critic Lens",
  bookforge_critic_batch: "Critic Batch",
  chapter_summaries: "Chapter Summaries",
  publishing_lab: "Publishing Lab",
  rewrite_drift_check: "Drift Check",
  manuscript_blueprint: "Manuscript Blueprint",
  world_bible_discovery: "World Bible Discovery",
  auto_revision: "Auto-Revision",
  creation_draft_generation: "Chapter Draft",
  voice_capture: "Voice Capture",
  revision_accept_all: "Accept Drafts",
};

type GlobalJob = {
  id: string;
  book_id: string;
  bookTitle: string;
  mode: string;
  status: string | null;
  created_at: string;
  progress: {
    totalUnits: number;
    attempted: number;
    successful: number;
    failed: number;
    currentUnit?: string | null;
  } | null;
};

type ActiveJobsResponse = {
  content?: { activeJobs: GlobalJob[]; recentJobs: GlobalJob[] };
};

// Every long-running AI job in this app is already tracked in one shared
// revision_jobs table -- the only reason it was ever invisible outside a
// specific book's Studio/dashboard page is that nothing polled it without
// a bookId filter. This mounts in the app shell (every route) so a job
// started on one book stays visible from anywhere, including a toast the
// moment it finishes or fails while the user is looking at something else.
export function GlobalJobIndicator() {
  const [activeJobs, setActiveJobs] = useState<GlobalJob[]>([]);
  const [opened, setOpened] = useState(false);
  const previousStatuses = useRef(new Map<string, string | null>());
  const notifiedJobIds = useRef(new Set<string>());
  const isFirstLoad = useRef(true);

  const poll = useCallback(async () => {
    try {
      const result = await fetchJson<ActiveJobsResponse>("/api/jobs/active", { cache: "no-store" }, "Load active jobs");
      const recentJobs = result.content?.recentJobs || [];

      if (!isFirstLoad.current) {
        for (const job of recentJobs) {
          const previous = previousStatuses.current.get(job.id);
          const justFinished = previous && ACTIVE_STATUSES.has(previous) && !ACTIVE_STATUSES.has(job.status || "");
          if (justFinished && !notifiedJobIds.current.has(job.id)) {
            notifiedJobIds.current.add(job.id);
            const label = MODE_LABELS[job.mode] || job.mode;
            notifications.show({
              color: job.status === "completed" ? "green" : "red",
              title: job.status === "completed" ? `${label} finished` : `${label} ${job.status}`,
              message: job.bookTitle,
            });
          }
        }
      }
      recentJobs.forEach((job) => previousStatuses.current.set(job.id, job.status));
      isFirstLoad.current = false;

      setActiveJobs(result.content?.activeJobs || []);
      return (result.content?.activeJobs || []).length > 0;
    } catch {
      // Silent -- this is a convenience indicator, not a blocking requirement.
      return false;
    }
  }, []);

  useAdaptivePolling(poll, {
    activeIntervalMs: ACTIVE_POLL_MS,
    idleIntervalMs: IDLE_POLL_MS,
    pauseWhenHidden: true,
    coordinatorKey: "global-jobs",
  });

  return (
    <Popover width={340} position="bottom-end" opened={opened} onChange={setOpened} withArrow shadow="md">
      <Popover.Target>
        <Indicator
          label={activeJobs.length || undefined}
          size={16}
          color="grape"
          disabled={activeJobs.length === 0}
          processing={activeJobs.length > 0}
        >
          <ActionIcon
            variant="light"
            color={activeJobs.length > 0 ? "grape" : "gray"}
            size="lg"
            onClick={() => setOpened((current) => !current)}
            aria-label="Active AI jobs"
          >
            {activeJobs.length > 0 ? <Loader size={16} color="grape" /> : <IconActivity size={18} />}
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="sm" fw={800} mb="xs">
          Active AI jobs
        </Text>
        {activeJobs.length === 0 ? (
          <Text size="xs" c="dimmed">
            Nothing running right now.
          </Text>
        ) : (
          <ScrollArea.Autosize mah={320}>
            <Stack gap="xs">
              {activeJobs.map((job) => {
                const display = getJobProgressDisplay(job.progress, job.status);
                return (
                  <UnstyledButton
                    key={job.id}
                    component={Link}
                    href={`/books/${job.book_id}/jobs?job=${encodeURIComponent(job.id)}`}
                    onClick={() => setOpened(false)}
                    p="xs"
                    style={{ borderRadius: 6, border: "1px solid var(--mantine-color-gray-3)" }}
                  >
                    <Text size="sm" fw={700} lineClamp={1}>
                      {job.bookTitle}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {MODE_LABELS[job.mode] || job.mode} — {job.status}
                      {display.total > 1 ? ` (${display.completed}/${display.total})` : ""}
                    </Text>
                    {job.progress?.currentUnit && (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {job.progress.currentUnit}
                      </Text>
                    )}
                  </UnstyledButton>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
