"use client";

import { Badge, Button, Group, Loader, Paper, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { motion } from "framer-motion";

export type AiJobQueueState = {
  currentTask: string;
  // Stable machine key (the revision_jobs `mode` value, e.g.
  // "creation_draft_generation") for matching this task programmatically --
  // `currentTask` is a human-readable label that can come from either the
  // client's own preflight data or the server's real progress.taskName, and
  // those two strings don't always agree (found live: the server calls it
  // "Creation Draft Generation", the button says "Generate Planned Draft"),
  // so code that needs to know WHICH task this is (e.g. Retry Failed) must
  // never match against currentTask.
  mode?: string;
  currentUnit: string;
  totalUnits: number;
  completedUnits: number;
  successfulUnits: number;
  failedUnits: number;
  skippedUnits: number;
  startedAt?: number;
  estimatedSecondsPerCall?: number;
  elapsedSeconds?: number;
  currentCallElapsedSeconds?: number;
  currentCallProgress?: number;
  nextCallSeconds?: number | null;
  estimatedSecondsRemaining?: number | null;
  estimatedProgress?: boolean;
  status: "idle" | "running" | "paused" | "cancelled" | "complete";
};

export function AiJobQueue({
  job,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
}: {
  job: AiJobQueueState;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRetryFailed?: () => void;
}) {
  const progress = job.totalUnits ? Math.round((job.completedUnits / job.totalUnits) * 100) : 0;
  const currentCall = getCurrentCall(job);
  const unitLabel = job.estimatedProgress ? "call" : "step";
  const unitLabelTitle = job.estimatedProgress ? "Call" : "Step";

  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Stack>
        <Group justify="space-between">
          <div>
            <Title order={2}>AI Job Queue</Title>
            <Text c="dimmed">Current task progress across manuscript units.</Text>
          </div>
          <Badge color={statusColor(job.status)}>{job.status}</Badge>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <QueueField label="Current task" value={job.currentTask || "No active task"} />
          <QueueField label="Current chapter/scene/paragraph" value={job.currentUnit || "None"} />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <QueueField label="Elapsed" value={formatDuration(job.elapsedSeconds || 0)} />
          <QueueField label={`Current ${unitLabel} elapsed`} value={formatDuration(job.currentCallElapsedSeconds || 0)} />
          <QueueField label={`Current ${unitLabel} progress`} value={`${Math.round((job.currentCallProgress || 0) * 100)}%`} />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <QueueField
            label={`Next estimated ${unitLabel}`}
            value={
              job.status === "running" && job.nextCallSeconds != null
                ? formatDuration(job.nextCallSeconds)
                : job.status === "complete"
                  ? "Done"
                  : "Not running"
            }
          />
          <QueueField
            label="Estimated time left"
            value={
              job.status === "running"
                ? job.totalUnits <= 1
                  ? `Single ${unitLabel}`
                  : job.estimatedSecondsRemaining == null
                    ? "Calibrating"
                    : formatDuration(job.estimatedSecondsRemaining)
                : job.status === "complete"
                  ? "0s"
                  : "Not running"
            }
          />
        </SimpleGrid>

        <div>
          <Group justify="space-between" mb={6}>
            <Text fw={700}>Total progress</Text>
            <Text c="dimmed">{progress}%</Text>
          </Group>
          <Progress value={progress} color="grape" radius="xl" />
        </div>

        <AiCallGraph
          totalCalls={job.totalUnits}
          completedCalls={job.completedUnits}
          currentCall={currentCall}
          failedCalls={job.failedUnits}
          skippedCalls={job.skippedUnits}
          estimatedSecondsRemaining={job.estimatedSecondsRemaining}
          currentCallProgress={job.currentCallProgress || 0}
          estimatedProgress={Boolean(job.estimatedProgress)}
          status={job.status}
          unitLabel={unitLabel}
          unitLabelTitle={unitLabelTitle}
        />

        <SimpleGrid cols={{ base: 2, md: 4 }}>
          <QueueField label={job.estimatedProgress && job.status === "running" ? "Estimated complete" : "Successful units"} value={job.estimatedProgress && job.status === "running" ? job.completedUnits : job.successfulUnits} />
          <QueueField label="Failed units" value={job.failedUnits} />
          <QueueField label="Skipped units" value={job.skippedUnits} />
          <QueueField label="Total units" value={job.totalUnits} />
        </SimpleGrid>

        <Group>
          <Button variant="light" color="yellow" disabled={job.status !== "running"} onClick={onPause}>
            Pause
          </Button>
          <Button variant="light" color="green" disabled={job.status !== "paused"} onClick={onResume}>
            Resume
          </Button>
          <Button variant="outline" color="red" disabled={job.status === "idle" || job.status === "complete"} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="outline" color="grape" disabled={job.failedUnits === 0} onClick={onRetryFailed}>
            Retry Failed
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function AiCallGraph({
  totalCalls,
  completedCalls,
  currentCall,
  failedCalls,
  skippedCalls,
  estimatedSecondsRemaining,
  currentCallProgress,
  estimatedProgress,
  status,
  unitLabel,
  unitLabelTitle,
}: {
  totalCalls: number;
  completedCalls: number;
  currentCall: number;
  failedCalls: number;
  skippedCalls: number;
  estimatedSecondsRemaining?: number | null;
  currentCallProgress: number;
  estimatedProgress: boolean;
  status: AiJobQueueState["status"];
  unitLabel: string;
  unitLabelTitle: string;
}) {
  const visibleCalls = buildVisibleCalls(totalCalls || 0, currentCall);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = totalCalls ? Math.min(1, completedCalls / totalCalls) : 0;
  const active = status === "running";

  return (
    <Paper withBorder radius="md" p="lg" bg="#17121f" c="white">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <Group justify="center">
          <div style={{ position: "relative", width: 170, height: 170 }}>
            <svg width="170" height="170" viewBox="0 0 140 140" aria-label="AI call progress">
              <defs>
                <linearGradient id="call-progress-gradient" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#d0bfff" />
                  <stop offset="55%" stopColor="#cc5de8" />
                  <stop offset="100%" stopColor="#20c997" />
                </linearGradient>
              </defs>
              <circle cx="70" cy="70" r={radius} stroke="rgba(255,255,255,0.12)" strokeWidth="12" fill="none" />
              <motion.circle
                cx="70"
                cy="70"
                r={radius}
                stroke="url(#call-progress-gradient)"
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={false}
                animate={{ strokeDashoffset: circumference * (1 - progress) }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                transform="rotate(-90 70 70)"
              />
            </svg>
            {active && (
              <motion.div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 18,
                  borderRadius: 999,
                  border: "1px solid rgba(204, 93, 232, 0.35)",
                }}
                animate={{ scale: [1, 1.08, 1], opacity: [0.45, 0.9, 0.45] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            <Stack gap={0} align="center" justify="center" style={{ position: "absolute", inset: 0 }}>
              <Text size="xs" c="rgba(255,255,255,0.68)" tt="uppercase" fw={700}>
                Current {unitLabelTitle}
              </Text>
              <Text fz={34} fw={900} lh={1}>
                {totalCalls ? currentCall : 0}
              </Text>
              <Text size="sm" c="rgba(255,255,255,0.72)">
                of {totalCalls || 0}
              </Text>
            </Stack>
          </div>
        </Group>

        <Stack justify="center">
          <Group justify="space-between">
            <div>
              <Title order={3} c="white">
                {estimatedProgress ? "AI Call Map" : "Workflow Step Map"}
              </Title>
              <Text c="rgba(255,255,255,0.68)" size="sm">
                {estimatedProgress
                  ? "Smaller calls keep local models faster and reduce context failures."
                  : "Auto Review is tracked by top-level workflow steps; paragraph units run inside the rewrite job."}
              </Text>
              <Text c="rgba(255,255,255,0.82)" size="sm" fw={700} mt={4}>
                {status === "running" && estimatedProgress
                  ? totalCalls <= 1
                    ? "Single call in progress"
                    : estimatedSecondsRemaining == null
                      ? "ETA calibrating after the first two calls"
                      : `Estimated time left: ${formatDuration(estimatedSecondsRemaining)}`
                  : status === "running"
                    ? `${unitLabelTitle} ${currentCall} of ${totalCalls || 0} running`
                  : status === "complete"
                    ? `All planned ${unitLabel}s complete`
                  : "Waiting for a task"}
              </Text>
              {status === "running" && (
                <div style={{ marginTop: 12 }}>
                  <Group justify="space-between" mb={4}>
                    <Text size="xs" c="rgba(255,255,255,0.58)" fw={700}>
                      Current {unitLabel} progress
                    </Text>
                    <Text size="xs" c="rgba(255,255,255,0.72)">
                      {Math.round(currentCallProgress * 100)}%
                    </Text>
                  </Group>
                  <Progress value={currentCallProgress * 100} color="grape" radius="xl" bg="rgba(255,255,255,0.12)" />
                </div>
              )}
            </div>
            <Badge color={statusColor(status)} variant="filled">
              {Math.round(progress * 100)}%
            </Badge>
          </Group>

          <Group gap={8} wrap="wrap">
            {visibleCalls.map((call) =>
              call.kind === "gap" ? (
                <Text key={call.key} c="rgba(255,255,255,0.5)" fw={800}>
                  ...
                </Text>
              ) : (
                <motion.div
                  key={call.index}
                  title={`AI call ${call.index} of ${totalCalls}`}
                  initial={false}
                  animate={{
                    scale: call.index === currentCall && active ? [1, 1.22, 1] : 1,
                    boxShadow:
                      call.index === currentCall && active
                        ? [
                            "0 0 0 rgba(204, 93, 232, 0)",
                            "0 0 22px rgba(204, 93, 232, 0.72)",
                            "0 0 0 rgba(204, 93, 232, 0)",
                          ]
                        : "0 0 0 rgba(0,0,0,0)",
                  }}
                  transition={{ duration: 1.2, repeat: call.index === currentCall && active ? Infinity : 0 }}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    color: callTextColor(call.index, completedCalls, currentCall, status),
                    background: callBackground(call.index, completedCalls, currentCall, totalCalls, status),
                    border: "1px solid rgba(255,255,255,0.18)",
                  }}
                >
                  {call.index}
                </motion.div>
              ),
            )}
          </Group>

          <SimpleGrid cols={3}>
            <GraphStat label={estimatedProgress && status === "running" ? "Estimated" : "Done"} value={completedCalls} color="#20c997" />
            <GraphStat label="Failed" value={failedCalls} color="#ff6b6b" />
            <GraphStat label="Skipped" value={skippedCalls} color="#ffd43b" />
          </SimpleGrid>
        </Stack>
      </SimpleGrid>
    </Paper>
  );
}

function QueueField({ label, value }: { label: string; value: string | number }) {
  return (
    <Paper withBorder radius="sm" p="md" bg="#fbfaf8">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={800}>{value}</Text>
    </Paper>
  );
}

/**
 * A one-line progress readout for a specific task, meant to render right
 * next to the button that started it. `AiJobQueue` above shows full detail
 * but is normally placed in a separate panel further down the page, which
 * makes long-running work look stalled to anyone who doesn't scroll down.
 */
export function AiJobQueueInlineStatus({ job, visible }: { job: AiJobQueueState; visible: boolean }) {
  if (!visible || job.status === "idle") return null;

  const rawProgress = job.totalUnits ? Math.round((job.completedUnits / job.totalUnits) * 100) : 0;
  // A bar frozen at a real 0% is indistinguishable from a stalled job --
  // there's no width for the "animated" stripe to move across, so a slow
  // first unit (e.g. one long chapter-draft call) reads as dead for
  // however many minutes it takes. Floor it to a visible sliver whenever
  // the job is genuinely running, so there's always something moving.
  const progress = job.status === "running" ? Math.max(6, rawProgress) : rawProgress;

  return (
    <Paper withBorder radius="md" p="sm" bg="#f8f4ff">
      <Group justify="space-between" mb={4}>
        <Group gap={8}>
          {job.status === "running" && <Loader size="xs" color="grape" />}
          <Text size="sm" fw={600}>
            {job.status === "running"
              ? `Working: ${job.currentUnit || job.currentTask}`
              : job.status === "paused"
                ? "Paused"
                : job.status === "complete"
                  ? "Done"
                  : "Stopped"}
          </Text>
        </Group>
        <Badge color={statusColor(job.status)} size="sm">{job.status}</Badge>
      </Group>
      <Progress value={progress} animated={job.status === "running"} color="grape" size="sm" />
      <Text size="xs" c="dimmed" mt={4}>
        {formatDuration(job.elapsedSeconds || 0)} elapsed
        {job.status === "running" && job.estimatedSecondsRemaining != null
          ? ` -- about ${formatDuration(job.estimatedSecondsRemaining)} left`
          : ""}
        {" -- "}{job.completedUnits}/{job.totalUnits} done
        {job.status === "running" && job.completedUnits === 0 && job.estimatedSecondsRemaining == null
          ? " -- the first unit can take several minutes on a cloud model"
          : ""}
      </Text>
    </Paper>
  );
}

function statusColor(status: AiJobQueueState["status"]) {
  if (status === "running") return "green";
  if (status === "paused") return "yellow";
  if (status === "cancelled") return "red";
  if (status === "complete") return "teal";
  return "gray";
}

function getCurrentCall(job: AiJobQueueState) {
  if (!job.totalUnits) return 0;
  if (job.status === "complete") return job.totalUnits;
  return Math.min(job.totalUnits, Math.max(1, job.completedUnits + 1));
}

function buildVisibleCalls(total: number, current: number) {
  if (total <= 28) {
    return Array.from({ length: total }, (_, index) => ({ kind: "call" as const, index: index + 1 }));
  }

  const important = new Set<number>([1, 2, total - 1, total]);
  for (let index = current - 4; index <= current + 4; index += 1) {
    if (index >= 1 && index <= total) important.add(index);
  }

  const sorted = Array.from(important).sort((a, b) => a - b);
  const result: Array<{ kind: "call"; index: number } | { kind: "gap"; key: string }> = [];
  sorted.forEach((index, position) => {
    const previous = sorted[position - 1];
    if (previous && index - previous > 1) result.push({ kind: "gap", key: `${previous}-${index}` });
    result.push({ kind: "call", index });
  });
  return result;
}

function callBackground(index: number, completed: number, current: number, total: number, status: AiJobQueueState["status"]) {
  if (status === "complete" || index <= completed) return "linear-gradient(135deg, #12b886, #69db7c)";
  if (index === current && status === "running") return "linear-gradient(135deg, #cc5de8, #845ef7)";
  if (index === total && total > 1) return "rgba(255,255,255,0.14)";
  return "rgba(255,255,255,0.08)";
}

function callTextColor(index: number, completed: number, current: number, status: AiJobQueueState["status"]) {
  if (status === "complete" || index <= completed || (index === current && status === "running")) return "white";
  return "rgba(255,255,255,0.66)";
}

function GraphStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Paper p="sm" radius="sm" bg="rgba(255,255,255,0.08)">
      <Text size="xs" c="rgba(255,255,255,0.62)">
        {label}
      </Text>
      <Text fw={900} c={color}>
        {value}
      </Text>
    </Paper>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}
