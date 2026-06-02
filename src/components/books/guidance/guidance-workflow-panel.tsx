"use client";

import { useState, useEffect, useRef } from "react";
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
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";
import { getJobProgressDisplay } from "@/lib/ai/job-state";

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
};

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
  in_progress: { label: "In progress", color: "blue"   },
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
      return { key: `priority:${i}`, group: "priority" as const, title, detail, suggestedStrategy: suggestStrategy(title + " " + detail) };
    }),
    ...actions.map((raw, i) => {
      const { title, detail } = parseItem(raw);
      return { key: `action:${i}`, group: "action" as const, title, detail, suggestedStrategy: suggestStrategy(title + " " + detail) };
    }),
  ];
}

// ── Rewrite modal ─────────────────────────────────────────────────────────────

type RewriteResult = {
  content?: {
    attempted?: number;
    rewritten?: number;
    skippedAccepted?: number;
    skippedExistingDrafts?: number;
  };
};

function RewriteModal({
  bookId,
  item,
  onClose,
  onSuccess,
}: {
  bookId: string;
  item: ActionItem | null;
  onClose: () => void;
  onSuccess: (itemKey: string) => void;
}) {
  const [strategy, setStrategy] = useState<RewriteStrategyId>("humanized_literary");
  const [instructions, setInstructions] = useState("");
  const [rewriteAccepted, setRewriteAccepted] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (item) {
      queueMicrotask(() => {
        setStrategy(item.suggestedStrategy as RewriteStrategyId);
        setInstructions(item.detail || item.title);
        setResult(null);
        setRewriteAccepted(false);
      });
    }
  }, [item]);

  async function startRewrite() {
    if (!item) return;
    setRunning(true);
    setResult(null);
    try {
      const data = await fetchJson<RewriteResult>(
        `/api/books/${bookId}/rewrite-execute`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            strategyId: strategy,
            authorInstructions: instructions.trim() || undefined,
            maxUnits: 500,
            coverageMode: "normal",
            rewriteAccepted,
          }),
        },
        "Guidance rewrite",
      );
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
    } catch (err) {
      setResult({ type: "error", message: err instanceof Error ? err.message : "Rewrite failed." });
    } finally {
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
}: {
  item: ActionItem;
  status: TaskStatus;
  onStatusClick: () => void;
  onRewrite: () => void;
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
          <Text size="xs" c="dimmed">
            Suggested:{" "}
            <Text span size="xs" fw={500}>
              {STRATEGY_OPTIONS.find((s) => s.value === item.suggestedStrategy)?.label ?? item.suggestedStrategy}
            </Text>
          </Text>
        </Stack>
        <Stack gap="xs" align="flex-end" style={{ flexShrink: 0 }}>
          <Badge
            color={meta.color}
            variant="light"
            style={{ cursor: "pointer" }}
            onClick={onStatusClick}
            title="Click to advance status"
          >
            {meta.label}
          </Badge>
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
  const prevAllDone = useRef(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/books/${bookId}/jobs`, { cache: "no-store" });
        const data = await res.json();
        const all: ActiveJob[] = data.content?.jobs ?? [];
        const running = all.filter((j) => ["running", "queued", "paused"].includes(j.status ?? ""));
        if (!active) return;
        setJobs(running);

        const allDoneNow = running.length === 0;
        if (allDoneNow && !prevAllDone.current) onAllDone();
        prevAllDone.current = allDoneNow;
      } catch {
        // silent — non-critical
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), 2500);
    return () => { active = false; window.clearInterval(interval); };
  }, [bookId, onAllDone]);

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
}: {
  bookId: string;
  reports: Report[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<GuidanceTask[]>([]);
  const [rewriteTarget, setRewriteTarget] = useState<ActionItem | null>(null);
  const [runningHumanize, setRunningHumanize] = useState(false);
  const [humanizeError, setHumanizeError] = useState("");

  const latest = reports.find((r) => r.report_type === "humanized_guidance");
  const content = latest?.content ?? null;
  const items = content ? buildItems(content) : [];

  const fit = (content?.modelFit && typeof content.modelFit === "object" ? content.modelFit : {}) as Record<string, unknown>;
  const fitScore = typeof fit.score === "number" ? fit.score : null;

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

  async function runHumanize() {
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

  const done        = items.filter((i) => statusFor(i.key) === "done").length;
  const skipped     = items.filter((i) => statusFor(i.key) === "skipped").length;
  const in_progress = items.filter((i) => statusFor(i.key) === "in_progress").length;
  const addressed   = done + skipped + in_progress;
  const progress    = items.length > 0 ? Math.round((addressed / items.length) * 100) : 0;

  const priorities = items.filter((i) => i.group === "priority");
  const actions    = items.filter((i) => i.group === "action");

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
            {fitScore != null && (
              <Badge color={fitScore >= 80 ? "green" : fitScore >= 60 ? "yellow" : "red"} variant="light">
                model fit {fitScore}%
              </Badge>
            )}
            <Button color="grape" variant="light" loading={runningHumanize} onClick={runHumanize} size="sm">
              {latest ? "Re-run analysis" : "Run analysis"}
            </Button>
          </Group>
        </Group>

        {/* Live rewrite job progress — always visible when jobs are active */}
        <RunningJobsStrip bookId={bookId} onAllDone={() => router.refresh()} />

        {humanizeError && <Alert color="red">{humanizeError}</Alert>}

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
                  <Text size="sm" fw={600}>Overall progress</Text>
                  <Text size="sm" c="dimmed">
                    {addressed} of {items.length} addressed ({done} done · {in_progress} in progress · {skipped} skipped)
                  </Text>
                </Group>
                <Progress value={progress} color={progress === 100 ? "green" : "blue"} radius="sm" />
              </Paper>
            )}


            {/* Priority items */}
            {priorities.length > 0 && (
              <Stack gap="xs">
                <Text fw={700} size="sm" tt="uppercase" c="dimmed">Top priorities</Text>
                {priorities.map((item) => (
                  <TaskCard
                    key={item.key}
                    item={item}
                    status={statusFor(item.key)}
                    onStatusClick={() => cycleStatus(item)}
                    onRewrite={() => setRewriteTarget(item)}
                  />
                ))}
              </Stack>
            )}

            {/* Action plan items */}
            {actions.length > 0 && (
              <Stack gap="xs">
                <Text fw={700} size="sm" tt="uppercase" c="dimmed">Action plan</Text>
                {actions.map((item) => (
                  <TaskCard
                    key={item.key}
                    item={item}
                    status={statusFor(item.key)}
                    onStatusClick={() => cycleStatus(item)}
                    onRewrite={() => setRewriteTarget(item)}
                  />
                ))}
              </Stack>
            )}
          </>
        )}
      </Stack>

      <RewriteModal
        bookId={bookId}
        item={rewriteTarget}
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
