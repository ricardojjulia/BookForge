"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Group, Paper, Progress, Stack, Switch, Text, ThemeIcon, Title, Loader } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { getJobProgressDisplay } from "@/lib/ai/job-state";
import { criticLenses } from "@/lib/critic/prompts";
import { fetchJson } from "@/lib/http/fetch-json";
import type { CriticLens } from "@/lib/types";

const ALL_LENSES = Object.keys(criticLenses) as CriticLens[];
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour safety cap per stage

const STAGE_LABELS = ["Plan", "Rewrite", "Accept", "Re-evaluate"] as const;

type JobRow = {
  id: string;
  mode: string;
  status: string | null;
  created_at: string;
  error_message: string | null;
  settings: Record<string, unknown> | null;
  progress: {
    currentUnit?: string | null;
    message?: string | null;
    totalUnits?: number;
    attempted?: number;
    successful?: number;
    failed?: number;
  } | null;
};

type JobsResponse = {
  content?: { jobs: JobRow[] };
};

type ScoresResponse = {
  content?: { scores: Partial<Record<CriticLens, number | null>> };
};

type StageProgress = { completed: number; total: number; percent: number };

type ResumePlan = {
  stage: number;
  focusLenses: CriticLens[];
  includeAccepted: boolean;
  doneLenses: CriticLens[];
};

const ACTIVE_STATUSES = new Set(["running", "queued", "paused"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCriticLens(value: unknown): value is CriticLens {
  return typeof value === "string" && value in criticLenses;
}

// Inspects this book's recent jobs for a focused-rewrite cycle (one launched
// by this panel, identified by the rewrite_plan job carrying focusLenses)
// that reached a stage but never continued past it -- e.g. the page was
// reloaded, or a code change interrupted the browser tab mid-run, while the
// server-managed jobs themselves kept running or already finished. Returns
// null when there's nothing to resume: no such cycle, or it already ran to
// completion.
function detectResumePlan(jobs: JobRow[]): ResumePlan | null {
  const latestPlan = jobs.find((job) => job.mode === "rewrite_plan");
  if (!latestPlan) return null;

  const focusLenses = (latestPlan.settings?.focusLenses as unknown[] | null | undefined)?.filter(isCriticLens) as
    | CriticLens[]
    | undefined;
  if (!focusLenses?.length) return null; // not a run launched by this panel

  if (ACTIVE_STATUSES.has(latestPlan.status || "")) {
    return { stage: 0, focusLenses, includeAccepted: true, doneLenses: [] };
  }
  if (latestPlan.status !== "completed") return null;

  const latestRewrite = jobs.find(
    (job) => job.mode === "full_book_rewrite" && Date.parse(job.created_at) > Date.parse(latestPlan.created_at),
  );
  if (!latestRewrite) return { stage: 1, focusLenses, includeAccepted: true, doneLenses: [] };
  const includeAccepted = (latestRewrite.settings?.rewriteAccepted as boolean | undefined) ?? true;
  if (ACTIVE_STATUSES.has(latestRewrite.status || "")) {
    return { stage: 1, focusLenses, includeAccepted, doneLenses: [] };
  }
  if (latestRewrite.status !== "completed") return null;

  const latestAccept = jobs.find(
    (job) => job.mode === "revision_accept_all" && Date.parse(job.created_at) > Date.parse(latestRewrite.created_at),
  );
  if (!latestAccept) return { stage: 2, focusLenses, includeAccepted, doneLenses: [] };
  if (ACTIVE_STATUSES.has(latestAccept.status || "")) {
    return { stage: 2, focusLenses, includeAccepted, doneLenses: [] };
  }
  if (latestAccept.status !== "completed") return null;

  const doneLenses = focusLenses.filter((lens) =>
    jobs.some(
      (job) =>
        job.mode === "bookforge_critic" &&
        job.settings?.lens === lens &&
        job.status === "completed" &&
        Date.parse(job.created_at) > Date.parse(latestAccept.created_at),
    ),
  );
  const remaining = focusLenses.filter((lens) => !doneLenses.includes(lens));
  if (!remaining.length) return null; // fully complete already

  return { stage: 3, focusLenses, includeAccepted, doneLenses };
}

export function FocusedRewritePanel({ bookId }: { bookId: string }) {
  const router = useRouter();
  const [selectedLenses, setSelectedLenses] = useState<CriticLens[]>([]);
  const [includeAccepted, setIncludeAccepted] = useState(true);
  const [running, setRunning] = useState(false);
  const [stageIndex, setStageIndex] = useState(-1);
  const [stageProgress, setStageProgress] = useState<StageProgress | null>(null);
  const [statusText, setStatusText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resumePlan, setResumePlan] = useState<ResumePlan | null>(null);
  const [completedRun, setCompletedRun] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchJson<JobsResponse>(`/api/books/${bookId}/jobs`, { cache: "no-store" }, "Check for an interrupted rewrite")
      .then((result) => {
        if (cancelled) return;
        setResumePlan(detectResumePlan(result.content?.jobs || []));
      })
      .catch(() => {
        // Silent -- this is a convenience check, not a blocking requirement.
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  function toggleLens(lens: CriticLens, checked: boolean) {
    setSelectedLenses((current) => (checked ? [...current, lens] : current.filter((item) => item !== lens)));
  }

  async function fetchScores(): Promise<Partial<Record<CriticLens, number | null>>> {
    try {
      const result = await fetchJson<ScoresResponse>(`/api/books/${bookId}/critic/scores`, { cache: "no-store" }, "Load critic scores");
      return result.content?.scores || {};
    } catch {
      return {};
    }
  }

  // Launches a server-managed job, then polls this book's job list by the
  // exact job id until it leaves running/paused/queued -- mirrors the
  // launch pattern already used by PersistentAiJobsPanel's retry/resume
  // flows, just driven synchronously by this button instead of the jobs UI.
  // stage/stageLabel drive the visible stepper -- a bare button spinner
  // gave no sense of where a multi-stage, potentially long-running rewrite
  // actually was.
  async function runServerManagedStep(
    path: string,
    body: Record<string, unknown>,
    label: string,
    stage: number,
  ): Promise<JobRow> {
    setStageIndex(stage);
    setStageProgress(null);
    setStatusText(label);
    const queued = await fetchJson<{ content?: { jobId?: string } }>(
      path,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, serverManaged: true }),
      },
      `${label} (queue)`,
    );
    const jobId = queued.content?.jobId;
    if (!jobId) throw new Error(`${label} did not return a job id.`);

    void fetchJson(
      path,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, jobId }),
      },
      `${label} (worker)`,
    ).catch(() => {
      // Errors surface through the polled job row's status/error_message below.
    });

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const result = await fetchJson<JobsResponse>(`/api/books/${bookId}/jobs`, { cache: "no-store" }, `${label} (status)`);
      const job = result.content?.jobs.find((row) => row.id === jobId);
      if (!job) continue;
      if (job.progress?.currentUnit) setStatusText(`${label}: ${job.progress.currentUnit}`);
      if (job.progress && (job.progress.totalUnits || 0) > 1) {
        setStageProgress(
          getJobProgressDisplay(
            {
              totalUnits: job.progress.totalUnits || 0,
              attempted: job.progress.attempted || 0,
              successful: job.progress.successful || 0,
              failed: job.progress.failed || 0,
            },
            job.status,
          ),
        );
      }
      if (job.status === "completed") return job;
      if (job.status === "failed") throw new Error(job.error_message || `${label} failed.`);
      if (job.status === "cancelled") throw new Error(`${label} was cancelled.`);
    }
    throw new Error(`${label} timed out waiting for completion.`);
  }

  // Drives stages [startStage..3] for the given lenses. A fresh click from
  // the form always starts at 0; resuming an interrupted cycle can start
  // anywhere and skip lenses already re-evaluated (doneLenses).
  async function runFrom(startStage: number, lenses: CriticLens[], accepted: boolean, doneLenses: CriticLens[]) {
    setRunning(true);
    setResumePlan(null);
    setCompletedRun(false);
    setMessage("");
    setError("");
    try {
      const beforeScores = await fetchScores();
      let acceptedSummary = "";

      if (startStage <= 0) {
        await runServerManagedStep(`/api/books/${bookId}/rewrite-plan`, { focusLenses: lenses }, "Planning rewrite", 0);
      }
      if (startStage <= 1) {
        await runServerManagedStep(
          `/api/books/${bookId}/rewrite-execute`,
          {
            maxUnits: 5000,
            distributeAcrossChapters: true,
            rewriteAccepted: accepted,
            rewriteExistingDrafts: accepted,
          },
          "Rewriting manuscript",
          1,
        );
      }
      if (startStage <= 2) {
        const acceptJob = await runServerManagedStep(
          `/api/books/${bookId}/revisions/accept-all`,
          {},
          "Accepting rewritten paragraphs",
          2,
        );
        acceptedSummary = acceptJob.progress?.message || "Paragraphs accepted.";
      } else {
        setStageIndex(2); // already done before this resume -- show it as complete, not skipped
      }

      const remainingLenses = lenses.filter((lens) => !doneLenses.includes(lens));
      for (const [index, lens] of remainingLenses.entries()) {
        await runServerManagedStep(
          `/api/books/${bookId}/critic`,
          { lens, stage: "post_rewrite", refreshBaseline: true },
          `Re-evaluating ${criticLenses[lens].label}`,
          3,
        );
        setStageProgress({
          completed: doneLenses.length + index + 1,
          total: lenses.length,
          percent: Math.round(((doneLenses.length + index + 1) / lenses.length) * 100),
        });
      }
      setStageIndex(4); // past the last stage so the stepper shows everything complete

      const afterScores = await fetchScores();
      const scoreDeltas = lenses
        .map((lens) => {
          const before = beforeScores[lens] ?? null;
          const after = afterScores[lens] ?? null;
          return `${criticLenses[lens].label}: ${before ?? "--"} → ${after ?? "--"}`;
        })
        .join(", ");

      setMessage(`Rewrite complete.${acceptedSummary ? ` ${acceptedSummary}` : ""} ${scoreDeltas}.`);
      setCompletedRun(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Focused rewrite failed.");
    } finally {
      setRunning(false);
      setStageIndex(-1);
      setStageProgress(null);
      setStatusText("");
    }
  }

  function startNewRewrite() {
    setCompletedRun(false);
    setMessage("");
    setError("");
  }

  function run() {
    if (!selectedLenses.length) return;
    void runFrom(0, selectedLenses, includeAccepted, []);
  }

  function resume() {
    if (!resumePlan) return;
    setSelectedLenses(resumePlan.focusLenses);
    setIncludeAccepted(resumePlan.includeAccepted);
    void runFrom(resumePlan.stage, resumePlan.focusLenses, resumePlan.includeAccepted, resumePlan.doneLenses);
  }

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Stack>
        <div>
          <Title order={2}>Rewrite with Selected Critics</Title>
          <Text c="dimmed">
            Pick the critic lenses you want this rewrite to prioritize. BookForge plans and executes a full-book
            rewrite focused on those lenses, accepts the rewritten paragraphs, then refreshes their scores above.
          </Text>
        </div>

        {resumePlan && !running && (
          <Alert color="yellow" title="An interrupted rewrite was found">
            A focused rewrite for {resumePlan.focusLenses.map((lens) => criticLenses[lens].label).join(", ")} stopped
            after the &ldquo;{STAGE_LABELS[Math.min(resumePlan.stage, 3)]}&rdquo; stage without finishing. Nothing needs to be
            redone -- resume to pick up where it left off.
            <Group mt="xs">
              <Button size="xs" color="yellow" variant="filled" onClick={resume}>
                Resume
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={() => setResumePlan(null)}>
                Dismiss
              </Button>
            </Group>
          </Alert>
        )}

        <Stack gap="xs">
          {ALL_LENSES.map((lens) => (
            <Checkbox
              key={lens}
              label={criticLenses[lens].label}
              description={criticLenses[lens].instruction}
              checked={selectedLenses.includes(lens)}
              disabled={running || completedRun}
              onChange={(event) => toggleLens(lens, event.currentTarget.checked)}
            />
          ))}
        </Stack>

        <Switch
          label="Also re-rewrite already-accepted paragraphs"
          description="Turn off to only fill in paragraphs that have never been rewritten."
          checked={includeAccepted}
          disabled={running || completedRun}
          onChange={(event) => setIncludeAccepted(event.currentTarget.checked)}
        />

        {running && (
          <Stack gap={6}>
            <Group gap="xs" wrap="nowrap">
              {STAGE_LABELS.map((label, index) => (
                <Group key={label} gap={6} wrap="nowrap" style={{ flex: 1 }}>
                  <ThemeIcon
                    size={22}
                    radius="xl"
                    variant={index < stageIndex ? "filled" : index === stageIndex ? "light" : "outline"}
                    color={index < stageIndex ? "green" : "grape"}
                  >
                    {index < stageIndex ? (
                      <IconCheck size={13} />
                    ) : index === stageIndex ? (
                      <Loader size={11} color="grape" />
                    ) : (
                      <Text fz={9}>{index + 1}</Text>
                    )}
                  </ThemeIcon>
                  <Text size="xs" fw={index === stageIndex ? 700 : 400} c={index === stageIndex ? undefined : "dimmed"}>
                    {label}
                  </Text>
                  {index < STAGE_LABELS.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: index < stageIndex ? "var(--mantine-color-green-4)" : "var(--mantine-color-gray-3)" }} />
                  )}
                </Group>
              ))}
            </Group>
            <Text size="sm">{statusText || "Working..."}</Text>
            {stageProgress && (
              <Group gap="xs" wrap="nowrap">
                <Progress value={stageProgress.percent} color="grape" size="sm" style={{ flex: 1 }} />
                <Text size="xs" c="dimmed">
                  {stageProgress.completed}/{stageProgress.total}
                </Text>
              </Group>
            )}
          </Stack>
        )}

        {!completedRun && (
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              {running ? "" : selectedLenses.length ? `${selectedLenses.length} lens(es) selected.` : "Select at least one critic lens."}
            </Text>
            <Button color="grape" loading={running} disabled={!selectedLenses.length} onClick={run}>
              Run Full Rewrite (Selected Critics)
            </Button>
          </Group>
        )}

        {message && (
          <Alert color="green">
            {message}
            {completedRun && (
              <Group mt="xs">
                <Button size="xs" color="grape" onClick={startNewRewrite}>
                  Start a New Rewrite
                </Button>
              </Group>
            )}
          </Alert>
        )}
        {error && <Alert color="red">{error}</Alert>}
      </Stack>
    </Paper>
  );
}
