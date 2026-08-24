"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  Progress,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AiTaskPreflight, type AiTaskPreflightData } from "@/components/ai/ai-task-preflight";
import { fetchJson } from "@/lib/http/fetch-json";
import { buildCriticAllPreflight } from "@/lib/ai/critic-all-preflight";
import { getJobProgressDisplay } from "@/lib/ai/job-state";
import { useAdaptivePolling } from "@/lib/hooks/use-adaptive-polling";

const ACTIVE_POLL_MS = 4000;
const IDLE_POLL_MS = 30000;

// ── Types ─────────────────────────────────────────────────────────────────────

type Report = {
  id: string;
  report_type: string;
  created_at: string;
  content: Record<string, unknown> | null;
};

type TaskStatus = "todo" | "in_progress" | "done" | "skipped";

type GuidanceTask = {
  id: string;
  report_id: string;
  item_key: string;
  status: TaskStatus;
};

type ActionItem = {
  key: string;
  group: "priority" | "action";
  title: string;
  detail: string;
  suggestedStrategy: string;
  /** First chapter number the item's own text names ("In Chapter 4...", "For Chapter 2..."), or null for items with no chapter reference -- those are the genuinely book-wide ones. */
  detectedChapterNumber: number | null;
};

type ChapterOption = { id: string; chapterNumber: number; title: string | null };

type RewriteStrategyId =
  | "conservative_polish"
  | "humanized_literary"
  | "clarity_readability"
  | "emotional_depth"
  | "contemporary_view"
  | "creative_enhancement"
  | "custom";

// ── Constants ──────────────────────────────────────────────────────────────────

const STRATEGY_OPTIONS: { value: RewriteStrategyId; label: string }[] = [
  { value: "humanized_literary",   label: "Humanized literary pass" },
  { value: "conservative_polish",  label: "Conservative polish" },
  { value: "clarity_readability",  label: "Clarity / readability" },
  { value: "emotional_depth",      label: "Emotional depth" },
  { value: "contemporary_view",    label: "Contemporary view" },
  { value: "creative_enhancement", label: "Full creative enhancement" },
  { value: "custom",               label: "Custom (use instructions only)" },
];

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  todo:        { label: "To do",       color: "gray"   },
  in_progress: { label: "Marked in progress", color: "blue"   },
  done:        { label: "Done",        color: "green"  },
  skipped:     { label: "Skipped",     color: "orange" },
};

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  todo:        "in_progress",
  in_progress: "done",
  done:        "skipped",
  skipped:     "todo",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function suggestStrategy(text: string): RewriteStrategyId {
  const t = text.toLowerCase();
  if (/voice|authentic|preserv|author/.test(t))       return "humanized_literary";
  if (/read|clarity|clear|simplif|access/.test(t))    return "clarity_readability";
  if (/emotion|feel|depth|heart|connect/.test(t))     return "emotional_depth";
  if (/contempor|modern|current|fresh|relev/.test(t)) return "contemporary_view";
  if (/creat|enrich|vivid|enhance|imag/.test(t))      return "creative_enhancement";
  if (/polish|conserv|subtle|minimal/.test(t))        return "conservative_polish";
  return "humanized_literary";
}

// Most guidance items name a specific chapter in their own generated text
// ("In Chapter 4, linger longer...", "For Chapter 2, try starting with...").
// Take the first mention as the default scope suggestion -- still just a
// pre-fill the user can change via the chapter picker, not a hard rule.
// Items with no chapter reference are the genuinely book-wide ones.
function detectChapterNumber(text: string): number | null {
  const match = /chapter\s+(\d+)/i.exec(text);
  return match ? Number(match[1]) : null;
}

function parseItem(raw: unknown): { title: string; detail: string } {
  if (typeof raw === "string") return { title: raw, detail: "" };
  if (!raw || typeof raw !== "object") return { title: String(raw), detail: "" };
  const r = raw as Record<string, unknown>;
  const title = [r.title, r.recommendation].find((v) => typeof v === "string") as string ?? "";
  const detail = [r.whatToDoNext, r.whyItMatters]
    .filter((v) => typeof v === "string")
    .join(" — ");
  return { title, detail };
}

function buildItems(content: Record<string, unknown>): ActionItem[] {
  const priorities = Array.isArray(content.topPriorities) ? content.topPriorities : [];
  const actions    = Array.isArray(content.humanizedActionPlan) ? content.humanizedActionPlan : [];
  return [
    ...priorities.map((raw, i) => {
      const { title, detail } = parseItem(raw);
      return {
        key: `priority:${i}`,
        group: "priority" as const,
        title,
        detail,
        suggestedStrategy: suggestStrategy(title + " " + detail),
        detectedChapterNumber: detectChapterNumber(title + " " + detail),
      };
    }),
    ...actions.map((raw, i) => {
      const { title, detail } = parseItem(raw);
      return {
        key: `action:${i}`,
        group: "action" as const,
        title,
        detail,
        suggestedStrategy: suggestStrategy(title + " " + detail),
        detectedChapterNumber: detectChapterNumber(title + " " + detail),
      };
    }),
  ];
}

// ── Rewrite modal ─────────────────────────────────────────────────────────────

type RewriteResult = {
  content?: {
    revisionJobId?: string;
    attempted?: number;
    rewritten?: number;
    skippedAccepted?: number;
    skippedExistingDrafts?: number;
  };
};

const WHOLE_BOOK_SCOPE = "__whole_book__";

function RewriteModal({
  bookId,
  item,
  chapters,
  onClose,
  onSuccess,
}: {
  bookId: string;
  item: ActionItem | null;
  chapters: ChapterOption[];
  onClose: () => void;
  onSuccess: (itemKey: string) => void;
}) {
  const [strategy, setStrategy] = useState<RewriteStrategyId>("humanized_literary");
  const [instructions, setInstructions] = useState("");
  const [scopeChapterId, setScopeChapterId] = useState<string>(WHOLE_BOOK_SCOPE);
  const [rewriteAccepted, setRewriteAccepted] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (item) {
      queueMicrotask(() => {
        setStrategy(item.suggestedStrategy as RewriteStrategyId);
        setInstructions(item.detail || item.title);
        // Pre-fill scope from the chapter the item's own text names, if any
        // -- still just a default; the picker below lets the user widen it
        // to the whole book or narrow it to a different chapter.
        const detected = item.detectedChapterNumber
          ? chapters.find((c) => c.chapterNumber === item.detectedChapterNumber)
          : undefined;
        setScopeChapterId(detected?.id || WHOLE_BOOK_SCOPE);
        setResult(null);
        setRewriteAccepted(false);
      });
    }
  }, [item, chapters]);

  async function startRewrite() {
    if (!item) return;
    setRunning(true);
    setResult(null);
    const payload = {
      strategyId: strategy,
      authorInstructions: instructions.trim() || undefined,
      maxUnits: 500,
      coverageMode: "normal" as const,
      rewriteAccepted,
      ...(scopeChapterId !== WHOLE_BOOK_SCOPE ? { chapterId: scopeChapterId } : {}),
    };
    try {
      const queued = await fetchJson<RewriteResult>(
        `/api/books/${bookId}/rewrite-execute`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, serverManaged: true }),
        },
        "Queue guidance rewrite",
      );
      const revisionJobId = queued?.content?.revisionJobId;
      if (!revisionJobId) {
        throw new Error("Rewrite job was not created.");
      }

      setResult({
        type: "success",
        message: "Rewrite was queued and is now running in the background.",
      });

      void fetchJson<RewriteResult>(
        `/api/books/${bookId}/rewrite-execute`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, jobId: revisionJobId }),
        },
        "Guidance rewrite worker",
      )
        .then((data) => {
          const attempted = data?.content?.attempted ?? 0;
          const rewritten = data?.content?.rewritten ?? 0;
          const skippedAccepted = data?.content?.skippedAccepted ?? 0;

          if (attempted === 0 && skippedAccepted > 0 && !rewriteAccepted) {
            setResult({
              type: "warning",
              message: `All ${skippedAccepted} paragraph${skippedAccepted !== 1 ? "s" : ""} already have accepted revisions. Enable "Re-run on accepted paragraphs" below and try again to rewrite existing content.`,
            });
          } else if (attempted === 0) {
            setResult({
              type: "warning",
              message: "No eligible paragraphs found. All paragraphs may be locked, too short, or already have pending drafts.",
            });
          } else {
            setResult({
              type: "success",
              message: `${rewritten} of ${attempted} paragraph${attempted !== 1 ? "s" : ""} queued for rewrite. Review drafts in the Revisions page.`,
            });
            onSuccess(item.key);
            router.refresh();
          }
        })
        .catch((err) => {
          setResult({ type: "error", message: err instanceof Error ? err.message : "Rewrite failed." });
        })
        .finally(() => {
          setRunning(false);
        });
    } catch (err) {
      setResult({ type: "error", message: err instanceof Error ? err.message : "Rewrite failed." });
      setRunning(false);
    }
  }

  const isDone = result?.type === "success";

  return (
    <Modal
      opened={Boolean(item)}
      onClose={onClose}
      title="Run targeted rewrite"
      size="md"
    >
      {item && (
        <Stack>
          <Paper withBorder p="sm" radius="md" bg="#fbfaf8">
            <Text size="sm" fw={600}>{item.title}</Text>
            {item.detail && <Text size="xs" c="dimmed" mt={2}>{item.detail}</Text>}
          </Paper>
          <Select
            label="Scope"
            description={
              scopeChapterId === WHOLE_BOOK_SCOPE
                ? "This will run against every eligible paragraph in the whole book."
                : "This will run against only this chapter's eligible paragraphs."
            }
            data={[
              { value: WHOLE_BOOK_SCOPE, label: "Whole book" },
              ...chapters.map((c) => ({ value: c.id, label: `Chapter ${c.chapterNumber}${c.title ? `: ${c.title}` : ""}` })),
            ]}
            value={scopeChapterId}
            onChange={(v) => setScopeChapterId(v || WHOLE_BOOK_SCOPE)}
          />
          <Select
            label="Rewrite strategy"
            description="Pre-selected based on the guidance item — adjust as needed."
            data={STRATEGY_OPTIONS}
            value={strategy}
            onChange={(v) => setStrategy((v as RewriteStrategyId) ?? "humanized_literary")}
          />
          <Textarea
            label="Author instructions"
            description="Passed directly to the AI alongside the strategy. Edit or clear."
            value={instructions}
            onChange={(e) => setInstructions(e.currentTarget.value)}
            autosize
            minRows={3}
            maxRows={6}
          />
          <Checkbox
            label="Re-run on already-accepted paragraphs"
            description="Use this if all paragraphs have been accepted in a previous session."
            checked={rewriteAccepted}
            onChange={(e) => setRewriteAccepted(e.currentTarget.checked)}
          />
          {result && (
            <Alert color={result.type === "success" ? "green" : result.type === "warning" ? "yellow" : "red"}>
              {result.message}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose}>Cancel</Button>
            <Button loading={running} onClick={startRewrite} disabled={isDone}>
              {isDone ? "Done" : "Start rewrite"}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({
  item,
  status,
  onStatusClick,
  onRewrite,
  onSendToCreativeWriter,
  sendingToCreativeWriter,
}: {
  item: ActionItem;
  status: TaskStatus;
  onStatusClick: () => void;
  onRewrite: () => void;
  onSendToCreativeWriter: () => void;
  sendingToCreativeWriter: boolean;
}) {
  const meta = STATUS_META[status];
  return (
    <Paper withBorder p="md" radius="md" bg={status === "done" ? "#f6fef9" : status === "skipped" ? "#fafafa" : "white"}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} style={{ opacity: status === "skipped" ? 0.45 : 1 }}>
            {item.title}
          </Text>
          {item.detail && (
            <Text size="xs" c="dimmed" lineClamp={2}>{item.detail}</Text>
          )}
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              Suggested:{" "}
              <Text span size="xs" fw={500}>
                {STRATEGY_OPTIONS.find((s) => s.value === item.suggestedStrategy)?.label ?? item.suggestedStrategy}
              </Text>
            </Text>
            <Text size="xs" c="dimmed">·</Text>
            <Text size="xs" c="dimmed">
              {item.detectedChapterNumber ? `Chapter ${item.detectedChapterNumber}` : "Whole book"}
            </Text>
          </Group>
        </Stack>
        <Stack gap="xs" align="flex-end" style={{ flexShrink: 0 }}>
          <Badge
            color={meta.color}
            variant="light"
            style={{ cursor: "pointer" }}
            onClick={onStatusClick}
            title="Click to cycle status (To do -> Marked in progress -> Done -> Skipped)"
          >
            {meta.label}
          </Badge>
          <Button size="xs" variant="subtle" color="dark" loading={sendingToCreativeWriter} onClick={onSendToCreativeWriter}>
            Send to CreativeWriter
          </Button>
          {status !== "done" && status !== "skipped" && (
            <Button size="xs" variant="light" onClick={onRewrite}>
              Run rewrite
            </Button>
          )}
        </Stack>
      </Group>
    </Paper>
  );
}

// ── Running jobs strip ────────────────────────────────────────────────────────

type ActiveJob = {
  id: string;
  mode: string;
  status: string | null;
  progress: {
    taskName: string;
    currentUnit: string;
    totalUnits: number;
    attempted: number;
    successful: number;
    failed: number;
    skipped: number;
    startedAt?: string | null;
  } | null;
};

function RunningJobsStrip({ bookId, onAllDone }: { bookId: string; onAllDone: () => void }) {
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const hasSeenRunningJobs = useRef(false);

  const pollJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/jobs`, { cache: "no-store" });
      const data = await res.json();
      const all: ActiveJob[] = data.content?.jobs ?? [];
      const running = all.filter((job) => ["running", "queued", "paused"].includes(job.status ?? ""));
      setJobs(running);

      if (running.length > 0) {
        hasSeenRunningJobs.current = true;
      } else if (hasSeenRunningJobs.current) {
        onAllDone();
        hasSeenRunningJobs.current = false;
      }
      return running.length > 0;
    } catch {
      // Back off when polling fails to avoid hammering the jobs endpoint.
      return false;
    }
  }, [bookId, onAllDone]);

  useAdaptivePolling(pollJobs, {
    activeIntervalMs: ACTIVE_POLL_MS,
    idleIntervalMs: IDLE_POLL_MS,
    pauseWhenHidden: true,
    coordinatorKey: `book-jobs:${bookId}`,
  });

  if (jobs.length === 0) return null;

  return (
    <Stack gap="xs">
      {jobs.map((job) => {
        const { completed, total, percent } = getJobProgressDisplay(job.progress, job.status);
        return (
          <Paper key={job.id} withBorder p="sm" radius="md" bg="#f5f0ff">
            <Group justify="space-between" mb={4}>
              <Text size="xs" fw={600}>
                {job.progress?.taskName ?? job.mode.replace(/_/g, " ")}
              </Text>
              <Badge size="xs" color="grape" variant="dot">
                {job.progress?.currentUnit ?? job.status ?? "running"}
              </Badge>
            </Group>
            <Progress value={percent} color="grape" size="sm" radius="xl" animated={percent < 100} />
            <Text size="xs" c="dimmed" mt={4}>
              {completed} / {total} units · {percent}%
            </Text>
          </Paper>
        );
      })}
    </Stack>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function GuidanceWorkflowPanel({
  bookId,
  reports,
  criticStale = false,
  chapters = [],
  chapterCount = 0,
  sceneCount = 0,
  paragraphCount = 0,
}: {
  bookId: string;
  reports: Report[];
  /** True when paragraphs have been accepted (rewritten) more recently than baseline Critic last ran, so Critic's findings no longer reflect the current manuscript. */
  criticStale?: boolean;
  chapters?: ChapterOption[];
  chapterCount?: number;
  sceneCount?: number;
  paragraphCount?: number;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<GuidanceTask[]>([]);
  const [rewriteTarget, setRewriteTarget] = useState<ActionItem | null>(null);
  const [runningHumanize, setRunningHumanize] = useState(false);
  const [humanizeError, setHumanizeError] = useState("");
  const [criticPreflight, setCriticPreflight] = useState<AiTaskPreflightData | null>(null);
  const [criticPreflightOpen, setCriticPreflightOpen] = useState(false);
  const [criticPreflightLoading, setCriticPreflightLoading] = useState(false);
  const [refreshingCritic, setRefreshingCritic] = useState(false);
  const [sendingItemKey, setSendingItemKey] = useState<string | null>(null);
  const [creativeWriterResult, setCreativeWriterResult] = useState<{ itemKey: string; message: string } | null>(null);

  const latest = reports.find((r) => r.report_type === "humanized_guidance");
  const content = latest?.content ?? null;
  const items = content ? buildItems(content) : [];

  useEffect(() => {
    let active = true;

    async function loadTasks() {
      if (!latest) return;
      try {
        const res = await fetch(`/api/books/${bookId}/guidance-tasks`);
        const data = await res.json();
        if (!active) return;
        setTasks(data.tasks ?? []);
      } catch {
        // non-critical — UI falls back to "todo" for all items
      }
    }

    void loadTasks();
    return () => {
      active = false;
    };
  }, [bookId, latest]);

  function statusFor(key: string): TaskStatus {
    return tasks.find((t) => t.item_key === key && t.report_id === latest?.id)?.status ?? "todo";
  }

  async function cycleStatus(item: ActionItem) {
    if (!latest) return;
    const current = statusFor(item.key);
    const next = STATUS_CYCLE[current];
    // Optimistic update
    setTasks((prev) => {
      const existing = prev.find((t) => t.item_key === item.key && t.report_id === latest.id);
      if (existing) return prev.map((t) => t.item_key === item.key && t.report_id === latest.id ? { ...t, status: next } : t);
      return [...prev, { id: "", report_id: latest.id, item_key: item.key, status: next }];
    });
    await fetch(`/api/books/${bookId}/guidance-tasks`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportId: latest.id, itemKey: item.key, status: next }),
    });
  }

  async function runHumanizeOnly() {
    setRunningHumanize(true);
    setHumanizeError("");
    try {
      await fetchJson(`/api/books/${bookId}/humanize-guidance`, { method: "POST" }, "Humanize guidance");
      router.refresh();
    } catch (err) {
      setHumanizeError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setRunningHumanize(false);
    }
  }

  // Entry point for the "Run/Re-run analysis" button. Critic data feeds
  // straight into humanize-guidance's synthesis, so if it's gone stale
  // (paragraphs accepted more recently than Critic last ran), refreshing it
  // first is the only way this analysis reflects the current manuscript --
  // see criticStale's doc comment. Not stale: same one-call behavior as
  // before, no detour through a Critic refresh nobody needs.
  async function runHumanize() {
    if (!criticStale) {
      await runHumanizeOnly();
      return;
    }
    setCriticPreflightLoading(true);
    setHumanizeError("");
    try {
      const data = await buildCriticAllPreflight({ bookId, chapterCount, sceneCount, paragraphCount });
      setCriticPreflight(data);
      setCriticPreflightOpen(true);
    } catch (err) {
      setHumanizeError(err instanceof Error ? err.message : "Unable to prepare Critic refresh.");
    } finally {
      setCriticPreflightLoading(false);
    }
  }

  async function proceedWithCriticRefresh() {
    setCriticPreflightOpen(false);
    setRefreshingCritic(true);
    setHumanizeError("");
    try {
      await fetchJson(`/api/books/${bookId}/critic/all`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: "baseline" }),
      }, "Refresh BookForge Critic");
      setRefreshingCritic(false);
      await runHumanizeOnly();
    } catch (err) {
      setRefreshingCritic(false);
      setHumanizeError(err instanceof Error ? err.message : "Critic refresh failed.");
    }
  }

  // Sends a guidance item to CreativeWriter as a real comment instead of an
  // AI rewrite -- see the "Send to CreativeWriter" / "Run rewrite" pairing
  // on every card. Attaches to the chapter's first paragraph when the item
  // names one, so it shows up in-context rather than as a book-level note.
  async function sendToCreativeWriter(item: ActionItem) {
    setSendingItemKey(item.key);
    setCreativeWriterResult(null);
    const chapter = item.detectedChapterNumber
      ? chapters.find((c) => c.chapterNumber === item.detectedChapterNumber)
      : undefined;
    try {
      await fetchJson(
        `/api/books/${bookId}/guidance-tasks/annotate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            note: item.detail ? `${item.title} — ${item.detail}` : item.title,
            ...(chapter ? { chapterId: chapter.id } : {}),
          }),
        },
        "Send to CreativeWriter",
      );
      setCreativeWriterResult({
        itemKey: item.key,
        message: chapter
          ? `Added as a comment on Chapter ${chapter.chapterNumber} in CreativeWriter.`
          : "Added as a book-level comment in CreativeWriter.",
      });
    } catch (err) {
      setCreativeWriterResult({
        itemKey: item.key,
        message: err instanceof Error ? err.message : "Unable to send to CreativeWriter.",
      });
    } finally {
      setSendingItemKey(null);
    }
  }

  const priorities = items.filter((i) => i.group === "priority");
  const actions    = items.filter((i) => i.group === "action");

  const done = items.filter((i) => statusFor(i.key) === "done").length;
  const skipped = items.filter((i) => statusFor(i.key) === "skipped").length;
  const inProgress = items.filter((i) => statusFor(i.key) === "in_progress").length;

  const priorityDone = priorities.filter((i) => statusFor(i.key) === "done").length;
  const priorityInProgress = priorities.filter((i) => statusFor(i.key) === "in_progress").length;
  const prioritySkipped = priorities.filter((i) => statusFor(i.key) === "skipped").length;

  // Weighted progress: priority tasks count double; in-progress is partial; skipped does not imply completion.
  const weightedCompleted = items.reduce((sum, item) => {
    const status = statusFor(item.key);
    const weight = item.group === "priority" ? 2 : 1;
    if (status === "done") return sum + weight;
    if (status === "in_progress") return sum + weight * 0.5;
    return sum;
  }, 0);
  const weightedTotal = items.reduce((sum, item) => sum + (item.group === "priority" ? 2 : 1), 0);
  const progress = weightedTotal > 0 ? Math.round((weightedCompleted / weightedTotal) * 100) : 0;

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Stack>
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Guidance Workflow</Title>
            <Text c="dimmed" size="sm">
              Turn Critic and drift findings into tracked, actionable rewrites.
            </Text>
          </div>
          <Group>
            {criticStale && (
              <Badge color="orange" variant="light">
                Critic data outdated
              </Badge>
            )}
            <Button
              color="grape"
              variant="light"
              loading={runningHumanize || criticPreflightLoading || refreshingCritic}
              onClick={runHumanize}
              size="sm"
            >
              {refreshingCritic
                ? "Refreshing Critic…"
                : latest
                  ? "Re-run analysis"
                  : "Run analysis"}
            </Button>
          </Group>
        </Group>

        {criticStale && (
          <Alert color="orange" variant="light">
            Manuscript paragraphs have been rewritten since BookForge Critic last ran, so its findings (and this
            analysis) may be out of date. Running analysis will refresh Critic first.
          </Alert>
        )}

        {/* Live rewrite job progress — always visible when jobs are active */}
        <RunningJobsStrip bookId={bookId} onAllDone={() => router.refresh()} />

        {humanizeError && <Alert color="red">{humanizeError}</Alert>}

        <AiTaskPreflight
          opened={criticPreflightOpen}
          data={criticPreflight}
          onProceed={() => { void proceedWithCriticRefresh(); }}
          onCancel={() => setCriticPreflightOpen(false)}
        />

        {!content ? (
          <Alert color="blue" variant="light">
            No guidance yet. Run the analysis above after you have Critic or drift reports.
          </Alert>
        ) : (
          <>
            {/* Summary + headline */}
            {typeof content.headline === "string" && (
              <Title order={3}>{content.headline}</Title>
            )}
            {typeof content.authorFriendlySummary === "string" && (
              <Text c="dimmed">{content.authorFriendlySummary}</Text>
            )}

            {/* Progress */}
            {items.length > 0 && (
              <Paper withBorder p="md" radius="md" bg="#fbfaf8">
                <Group justify="space-between" mb={6}>
                  <Text size="sm" fw={600}>Overall weighted progress</Text>
                  <Text size="sm" c="dimmed">
                    {done} done · {inProgress} in progress · {skipped} skipped
                  </Text>
                </Group>
                <Progress value={progress} color={progress === 100 ? "green" : "blue"} radius="sm" />
                <Text size="xs" c="dimmed" mt={6}>
                  &quot;In progress&quot; means the item is marked as actively worked (or rewrite was started from this card). Live execution appears above in Running jobs.
                </Text>
                {priorities.length > 0 && (
                  <Text size="xs" c="dimmed" mt={6}>
                    Priority progress: {priorityDone}/{priorities.length} done ({priorityInProgress} in progress · {prioritySkipped} skipped)
                  </Text>
                )}
              </Paper>
            )}


            {/* Priority items */}
            {priorities.length > 0 && (
              <Stack gap="xs">
                <Text fw={700} size="sm" tt="uppercase" c="dimmed">Top priorities</Text>
                {priorities.map((item) => (
                  <div key={item.key}>
                    <TaskCard
                      item={item}
                      status={statusFor(item.key)}
                      onStatusClick={() => cycleStatus(item)}
                      onRewrite={() => setRewriteTarget(item)}
                      onSendToCreativeWriter={() => void sendToCreativeWriter(item)}
                      sendingToCreativeWriter={sendingItemKey === item.key}
                    />
                    {creativeWriterResult?.itemKey === item.key && (
                      <Text size="xs" c="dimmed" mt={4} ml={4}>
                        {creativeWriterResult.message}{" "}
                        <Text component={Link} href={`/creativewriter?bookId=${bookId}`} span size="xs" fw={600} c="grape">
                          Open CreativeWriter →
                        </Text>
                      </Text>
                    )}
                  </div>
                ))}
              </Stack>
            )}

            {/* Action plan items */}
            {actions.length > 0 && (
              <Stack gap="xs">
                <Text fw={700} size="sm" tt="uppercase" c="dimmed">Action plan</Text>
                {actions.map((item) => (
                  <div key={item.key}>
                    <TaskCard
                      item={item}
                      status={statusFor(item.key)}
                      onStatusClick={() => cycleStatus(item)}
                      onRewrite={() => setRewriteTarget(item)}
                      onSendToCreativeWriter={() => void sendToCreativeWriter(item)}
                      sendingToCreativeWriter={sendingItemKey === item.key}
                    />
                    {creativeWriterResult?.itemKey === item.key && (
                      <Text size="xs" c="dimmed" mt={4} ml={4}>
                        {creativeWriterResult.message}{" "}
                        <Text component={Link} href={`/creativewriter?bookId=${bookId}`} span size="xs" fw={600} c="grape">
                          Open CreativeWriter →
                        </Text>
                      </Text>
                    )}
                  </div>
                ))}
              </Stack>
            )}
          </>
        )}
      </Stack>

      <RewriteModal
        bookId={bookId}
        item={rewriteTarget}
        chapters={chapters}
        onClose={() => setRewriteTarget(null)}
        onSuccess={(itemKey) => {
          const item = items.find((i) => i.key === itemKey);
          if (item && latest && statusFor(itemKey) === "todo") {
            void cycleStatus(item); // todo → in_progress
          }
          setRewriteTarget(null);
        }}
      />
    </Paper>
  );
}
