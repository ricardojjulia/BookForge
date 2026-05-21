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

type Mode = "full_review" | "make_shorter" | "make_longer";

type Props = { bookId: string; bookTitle: string };

const MODES: { value: Mode; icon: React.ReactNode; label: string; tagline: string; detail: string; color: string }[] = [
  {
    value: "full_review",
    icon: <IconRocket size={28} />,
    label: "Do it all for me!",
    tagline: "Full autonomous review cycle",
    detail:
      "Analyzes, critiques, rewrites, checks drift, and re-critiques. Loops until all 7 critics score ≥ 70 (up to 3 cycles). Then exports and marks the book finished.",
    color: "grape",
  },
  {
    value: "make_shorter",
    icon: <IconScissors size={28} />,
    label: "Make Shorter",
    tagline: "45–55% compression, then full review",
    detail:
      "Runs the same full cycle but the rewrite targets a 50% word-count reduction. Great for tightening first drafts or producing an abridged version.",
    color: "teal",
  },
  {
    value: "make_longer",
    icon: <IconArrowUp size={28} />,
    label: "Make Longer",
    tagline: "35–45% expansion, then full review",
    detail:
      "Expands prose depth by ~40%, then runs the full review cycle. Use this to develop a sparse draft into a fuller manuscript.",
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
    const res = await fetch(`/api/books/${bookId}/auto-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json() as { jobId?: string; error?: string };
    if (data.error) { alert(data.error); return; }
    setJobId(data.jobId!);
    setSelected(mode);
    setCompletedStages(resumeFrom?.stages_completed);
    setRunning(true);
    setResumableJob(null);
  }

  function reset() {
    setSelected(null);
    setRunning(false);
    setJobId(null);
    setCompletedStages(undefined);
    setResumableJob(null);
    setOpen(false);
  }

  function openWizard() {
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
          />
        ) : (
          <Stack gap="md">
            {resumableJob && (
              <Alert color="orange" icon={<IconPlayerPlay size={16} />} title="Previous run can be resumed">
                <Text size="sm" mb="xs">
                  {resumableJob.stages_completed.length} stage{resumableJob.stages_completed.length === 1 ? "" : "s"} completed before the last run stopped.
                  Resume to skip those and continue from where it left off.
                </Text>
                {resumableJob.error && <Text size="xs" c="dimmed" mb="xs">{resumableJob.error}</Text>}
                <Button size="xs" color="orange" leftSection={<IconPlayerPlay size={14} />} onClick={() => start(resumableJob)}>
                  Resume ({resumableJob.stages_completed.length} stages done)
                </Button>
              </Alert>
            )}

            <Text c="dimmed" size="sm">
              {checkingResume ? "Checking for previous runs…" : "Choose a mode. BookForge will run the entire workflow — no further decisions needed — until the book is published."}
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
                Start — I&apos;ll grab a coffee ☕
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
