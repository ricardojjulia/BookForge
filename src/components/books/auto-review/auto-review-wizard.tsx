"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconRocket, IconScissors, IconArrowUp, IconPlayerPlay } from "@tabler/icons-react";
import { AutoReviewRunner } from "./auto-review-runner";
import { mergeMetadataSnapshotBody } from "@/lib/book-metadata/selection";

type Mode = "full_review" | "make_shorter" | "make_longer";

type Props = { bookId: string; bookTitle: string };

const MODES: { value: Mode; icon: React.ReactNode; label: string; tagline: string; detail: string; color: string }[] = [
  {
    value: "full_review",
    icon: <IconRocket size={28} />,
    label: "Full Review",
    tagline: "Autonomous review and publish",
    detail:
      "Runs analyze, critics, rewrite, drift check, and re-critique. Repeats until all 7 critics are at least 70, up to 3 cycles, then exports and marks the book as finished.",
    color: "grape",
  },
  {
    value: "make_shorter",
    icon: <IconScissors size={28} />,
    label: "Make Shorter",
    tagline: "~50% shorter, then full review",
    detail:
      "Uses the full pipeline, with rewrite targeting 45-55% compression before quality checks and publish.",
    color: "teal",
  },
  {
    value: "make_longer",
    icon: <IconArrowUp size={28} />,
    label: "Make Longer",
    tagline: "~40% longer, then full review",
    detail:
      "Uses the full pipeline, with rewrite targeting 35-45% expansion before quality checks and publish.",
    color: "blue",
  },
];

type ResumableJob = {
  id: string;
  mode: Mode;
  stages_completed: string[];
  error: string | null;
};

export function AutoReviewWizard({ bookId, bookTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Mode | null>(null);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [completedStages, setCompletedStages] = useState<string[] | undefined>(undefined);
  const [resumableJob, setResumableJob] = useState<ResumableJob | null>(null);
  const [checkingResume, setCheckingResume] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function checkForResumableJob() {
    setCheckingResume(true);
    try {
      const res = await fetch(`/api/books/${bookId}/auto-review`);
      const data = await res.json() as { job?: ResumableJob & { status?: string } };
      const job = data.job;
      if (job && (job.status === "failed" || job.status === "running") && Array.isArray(job.stages_completed) && job.stages_completed.length > 0) {
        setResumableJob({ id: job.id, mode: job.mode, stages_completed: job.stages_completed, error: job.error });
      } else {
        setResumableJob(null);
      }
    } finally {
      setCheckingResume(false);
    }
  }

  async function start(resumeFrom?: ResumableJob) {
    const mode = resumeFrom?.mode ?? selected;
    if (!mode) return;
    setStartError(null);

    const res = await fetch(`/api/books/${bookId}/auto-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        serverManaged: true,
        jobId: resumeFrom?.id,
        ...mergeMetadataSnapshotBody(),
      }),
    });
    const data = await res.json() as { jobId?: string; content?: { jobId?: string }; error?: string };
    if (data.error) {
      setStartError(data.error);
      return;
    }
    const activeJobId = data.content?.jobId || data.jobId;
    if (!activeJobId) {
      setStartError("Failed to queue auto-review run.");
      return;
    }

    const launchToken = crypto.randomUUID();

    const launchAck = await fetch(`/api/books/${bookId}/auto-review/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: activeJobId, mode, launchToken, launchOnly: true, ...mergeMetadataSnapshotBody() }),
    });
    const launchData = await launchAck.json().catch(() => ({} as { error?: string }));
    if (!launchAck.ok || launchData?.error) {
      setStartError(launchData?.error || "Failed to launch auto-review worker.");
      return;
    }

    setJobId(activeJobId);
    setSelected(mode);
    setCompletedStages(resumeFrom?.stages_completed);
    setRunning(true);
    setResumableJob(null);

    void fetch(`/api/books/${bookId}/auto-review/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: activeJobId, mode, launchToken, ...mergeMetadataSnapshotBody() }),
    });
  }

  function reset() {
    setSelected(null);
    setRunning(false);
    setJobId(null);
    setCompletedStages(undefined);
    setResumableJob(null);
    setStartError(null);
    setOpen(false);
  }

  function openWizard() {
    setStartError(null);
    setOpen(true);
    checkForResumableJob();
  }

  return (
    <>
      <Button
        color="grape"
        variant="gradient"
        gradient={{ from: "grape", to: "indigo" }}
        size="md"
        onClick={openWizard}
      >
        Auto-Review Wizard
      </Button>

      <Modal
        opened={open}
        onClose={reset}
        title="Auto-Review Wizard"
        size={running ? "xl" : "lg"}
        centered
        closeOnClickOutside={!running}
        closeOnEscape={!running}
      >
        {running && jobId ? (
          <AutoReviewRunner
            bookId={bookId}
            bookTitle={bookTitle}
            jobId={jobId}
            mode={selected!}
            onDone={reset}
            completedStages={completedStages}
            serverManaged
          />
        ) : (
          <Stack gap="md">
            {startError && (
              <Alert color="red" title="Unable to start auto-review">
                <Text size="sm">{startError}</Text>
              </Alert>
            )}

            {resumableJob && (
              <Alert color="orange" icon={<IconPlayerPlay size={16} />} title="Resume available">
                <Text size="sm" mb="xs">
                  A previous run completed {resumableJob.stages_completed.length} stage{resumableJob.stages_completed.length === 1 ? "" : "s"} before stopping.
                  Resume continues from the next stage and skips completed work.
                </Text>
                {resumableJob.error && <Text size="xs" c="dimmed" mb="xs">Last stop reason: {resumableJob.error}</Text>}
                <Button size="xs" color="orange" leftSection={<IconPlayerPlay size={14} />} onClick={() => start(resumableJob)}>
                  Resume from stage {resumableJob.stages_completed.length + 1}
                </Button>
              </Alert>
            )}

            <Text c="dimmed" size="sm">
              {checkingResume ? "Checking for previous runs..." : "Choose a mode. BookForge runs the full pipeline automatically and publishes the result when complete."}
            </Text>

            <Stack gap="sm">
              {MODES.map((mode) => (
                <Card
                  key={mode.value}
                  withBorder
                  radius="md"
                  p="md"
                  style={{
                    cursor: "pointer",
                    border: selected === mode.value ? `2px solid var(--mantine-color-${mode.color}-6)` : undefined,
                    background: selected === mode.value ? `var(--mantine-color-${mode.color}-0)` : undefined,
                  }}
                  onClick={() => setSelected(mode.value)}
                >
                  <Group wrap="nowrap" align="flex-start">
                    <Radio
                      value={mode.value}
                      checked={selected === mode.value}
                      onChange={() => setSelected(mode.value)}
                      color={mode.color}
                    />
                    <ThemeIcon color={mode.color} variant="light" size="xl" radius="md">
                      {mode.icon}
                    </ThemeIcon>
                    <Box style={{ flex: 1 }}>
                      <Group gap="xs" mb={2}>
                        <Text fw={700}>{mode.label}</Text>
                        <Badge color={mode.color} variant="light" size="sm">{mode.tagline}</Badge>
                      </Group>
                      <Text size="sm" c="dimmed">{mode.detail}</Text>
                    </Box>
                  </Group>
                </Card>
              ))}
            </Stack>

            <Group justify="flex-end" mt="sm">
              <Button variant="subtle" color="gray" onClick={reset}>Cancel</Button>
              <Button
                color="grape"
                disabled={!selected}
                onClick={() => start()}
              >
                Start Auto-Review
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
