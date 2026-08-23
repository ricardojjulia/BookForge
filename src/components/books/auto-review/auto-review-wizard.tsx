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
import { IconRocket, IconScissors, IconArrowUp, IconPlayerPlay, IconChecklist } from "@tabler/icons-react";
import Link from "next/link";
import { AutoReviewRunner } from "./auto-review-runner";
import { CRITIC_LENS_COUNT } from "@/lib/critic/progress";
import { mergeMetadataSnapshotBody } from "@/lib/book-metadata/selection";

type Mode = "full_review" | "make_shorter" | "make_longer";
type Selection = Mode | "guided";

type Props = { bookId: string; bookTitle: string; plannedChapterCount?: number };

const MODES: { value: Mode; icon: React.ReactNode; label: string; tagline: string; detail: string; color: string }[] = [
  {
    value: "full_review",
    icon: <IconRocket size={28} />,
    label: "Full Review",
    tagline: "Autonomous review and publish",
    detail: `Runs analyze, critics, rewrite, drift check, and re-critique. Repeats until all ${CRITIC_LENS_COUNT} critics are at least 70, up to 3 cycles, then exports and marks the book as finished.`,
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

const GUIDED_OPTION = {
  value: "guided" as const,
  icon: <IconChecklist size={28} />,
  label: "Guided — Review Each Step",
  tagline: "You approve every stage, nothing auto-publishes",
  detail:
    "Takes you to the step-by-step rewrite workflow: generate a plan, run a small reviewable sample batch, approve the strategy, then continue in batches you control. Nothing runs or publishes automatically.",
  color: "dark",
};

type ResumableJob = {
  id: string;
  mode: Mode;
  stages_completed: string[];
  error: string | null;
};

type ModelStatusResponse = {
  connected?: boolean;
  configuredModels?: Array<{ key: string; model: string; available: boolean }>;
  cloudProvider?: { model: string | null; usedForPlanning: boolean; usedForRewrite: boolean } | null;
};

type ModelReadiness = { ready: boolean; missing: string[] };

// Auto-Review's pipeline needs a working model for two distinct task
// buckets -- planning/critic/extraction (blueprint, summaries, all 16
// critic calls) and rewrite (every paragraph rewrite) -- but nothing
// upstream of the pipeline itself ever checked either before this. A user
// with no reasoning or rewrite model configured could click Full Review and
// only find out ~5 stages deep, after blueprint/summaries/critic had
// already run and spent real time and (on managed-SaaS) real credit.
function computeModelReadiness(status: ModelStatusResponse): ModelReadiness {
  const configured = new Map((status.configuredModels || []).map((item) => [item.key, item]));
  const localAvailable = (key: string) => Boolean(status.connected && configured.get(key)?.available);
  const cloudReady = (forRewrite: boolean) =>
    Boolean(status.cloudProvider?.model && (forRewrite ? status.cloudProvider.usedForRewrite : status.cloudProvider.usedForPlanning));

  const planningReady = localAvailable("reasoningModel") || localAvailable("extractionModel") || cloudReady(false);
  const rewriteReady = localAvailable("primaryRewriteModel") || cloudReady(true);

  const missing: string[] = [];
  if (!planningReady) missing.push("a reasoning/extraction model for Blueprint, Summaries, and Critic");
  if (!rewriteReady) missing.push("a rewrite model for paragraph rewriting");

  return { ready: planningReady && rewriteReady, missing };
}

export function AutoReviewWizard({ bookId, bookTitle, plannedChapterCount = 0 }: Props) {
  const needsDraftingFirst = plannedChapterCount > 0;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [completedStages, setCompletedStages] = useState<string[] | undefined>(undefined);
  const [resumableJob, setResumableJob] = useState<ResumableJob | null>(null);
  const [checkingResume, setCheckingResume] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [modelReadiness, setModelReadiness] = useState<ModelReadiness | null>(null);
  const [checkingModels, setCheckingModels] = useState(false);

  async function checkModelReadiness() {
    setCheckingModels(true);
    try {
      const res = await fetch("/api/lmstudio/status", { cache: "no-store" });
      const status = (await res.json()) as ModelStatusResponse;
      setModelReadiness(computeModelReadiness(status));
    } catch {
      // Unreachable status check shouldn't block the wizard on its own --
      // the job-creation/pipeline routes still fail clearly if a model
      // genuinely isn't usable. Only block on a confirmed gap, not a
      // failed check.
      setModelReadiness(null);
    } finally {
      setCheckingModels(false);
    }
  }

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
    if (!mode || mode === "guided") return;
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
    checkModelReadiness();
  }

  return (
    <>
      <Box>
        <Button
          color="grape"
          variant="gradient"
          gradient={{ from: "grape", to: "indigo" }}
          size="md"
          disabled={needsDraftingFirst}
          onClick={openWizard}
        >
          Auto-Review Wizard
        </Button>
        {needsDraftingFirst && (
          <Text size="xs" c="dimmed" mt={4} maw={220}>
            Write Your Chapters first -- this book still has {plannedChapterCount} undrafted chapter
            {plannedChapterCount === 1 ? "" : "s"}.
          </Text>
        )}
      </Box>

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
            mode={selected as Mode}
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

            {modelReadiness && !modelReadiness.ready && (
              <Alert color="red" title="Missing model setup">
                <Text size="sm" mb="xs">
                  Auto-Review can&apos;t run yet -- it&apos;s missing {modelReadiness.missing.join(" and ")}.
                </Text>
                <Button component={Link} href="/settings" size="xs" color="red" variant="light">
                  Configure in Settings
                </Button>
              </Alert>
            )}

            {resumableJob && (
              <Alert color="orange" icon={<IconPlayerPlay size={16} />} title="Resume available">
                <Text size="sm" mb="xs">
                  A previous run completed {resumableJob.stages_completed.length} stage{resumableJob.stages_completed.length === 1 ? "" : "s"} before stopping.
                  Resume continues from the next stage and skips completed work.
                </Text>
                {resumableJob.error && <Text size="xs" c="dimmed" mb="xs">Last stop reason: {resumableJob.error}</Text>}
                <Button
                  size="xs"
                  color="orange"
                  leftSection={<IconPlayerPlay size={14} />}
                  disabled={Boolean(modelReadiness && !modelReadiness.ready)}
                  onClick={() => start(resumableJob)}
                >
                  Resume from stage {resumableJob.stages_completed.length + 1}
                </Button>
              </Alert>
            )}

            <Text c="dimmed" size="sm">
              {checkingResume || checkingModels
                ? "Checking model setup and previous runs..."
                : "Choose a mode. The first three run the full pipeline automatically and publish when complete. Guided lets you review and approve each stage yourself."}
            </Text>

            <Stack gap="sm">
              {[...MODES, GUIDED_OPTION].map((mode) => {
                const blocked = mode.value !== "guided" && Boolean(modelReadiness && !modelReadiness.ready);
                return (
                <Card
                  key={mode.value}
                  withBorder
                  radius="md"
                  p="md"
                  style={{
                    cursor: blocked ? "not-allowed" : "pointer",
                    opacity: blocked ? 0.5 : 1,
                    border: selected === mode.value ? `2px solid var(--mantine-color-${mode.color}-6)` : undefined,
                    background: selected === mode.value ? `var(--mantine-color-${mode.color}-0)` : undefined,
                  }}
                  onClick={() => !blocked && setSelected(mode.value)}
                >
                  <Group wrap="nowrap" align="flex-start">
                    <Radio
                      value={mode.value}
                      checked={selected === mode.value}
                      disabled={blocked}
                      onChange={() => !blocked && setSelected(mode.value)}
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
                );
              })}
            </Stack>

            <Group justify="flex-end" mt="sm">
              <Button variant="subtle" color="gray" onClick={reset}>Cancel</Button>
              {selected === "guided" ? (
                <Button component={Link} href={`/books/${bookId}/critic-quality`} color="dark">
                  Go to Guided Workflow
                </Button>
              ) : (
                <Button
                  color="grape"
                  disabled={!selected || Boolean(modelReadiness && !modelReadiness.ready)}
                  onClick={() => start()}
                >
                  Start Auto-Review
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
