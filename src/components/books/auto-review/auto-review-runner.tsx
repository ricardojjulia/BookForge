"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Progress,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconCheck,
  IconX,
  IconPlayerPlay,
  IconTrophy,
} from "@tabler/icons-react";

type Mode = "full_review" | "make_shorter" | "make_longer";

type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";

type Stage = {
  id: string;
  label: string;
  group: string;
};

type StageState = Stage & { status: StageStatus; detail?: string };

const CRITIC_LENSES = [
  "story_structure",
  "prose_quality",
  "continuity",
  "character_depth",
  "market_fit",
  "theology_worldview",
  "revision_priorities",
] as const;

const CRITIC_LABELS: Record<string, string> = {
  story_structure: "Story Structure",
  prose_quality: "Prose Quality",
  continuity: "Continuity",
  character_depth: "Character Depth",
  market_fit: "Market Fit",
  theology_worldview: "Theology / Worldview",
  revision_priorities: "Revision Priorities",
};

function buildStages(): Stage[] {
  return [
    { id: "analyze", label: "Analyze & Blueprint", group: "Prep" },
    { id: "summarize", label: "Summarize Chapters", group: "Prep" },
    ...CRITIC_LENSES.map((lens) => ({
      id: `critic_baseline:${lens}`,
      label: `Critic · ${CRITIC_LABELS[lens]}`,
      group: "Baseline Critics",
    })),
    { id: "rewrite_plan", label: "Generate Rewrite Plan", group: "Rewrite" },
    { id: "rewrite_execute", label: "Execute Rewrite", group: "Rewrite" },
    { id: "auto_accept", label: "Auto-Accept Drafts", group: "Rewrite" },
    { id: "drift_check", label: "Drift Check", group: "Quality" },
    ...CRITIC_LENSES.map((lens) => ({
      id: `critic_post:${lens}`,
      label: `Post-Critic · ${CRITIC_LABELS[lens]}`,
      group: "Post-Rewrite Critics",
    })),
    { id: "critics_check", label: "Quality Gate", group: "Quality" },
    { id: "export", label: "Export Manuscript", group: "Publish" },
    { id: "mark_finished", label: "Mark as Finished", group: "Publish" },
  ];
}

const STRATEGY_BY_MODE: Record<Mode, { strategyId: string; strategySettings: Record<string, unknown> }> = {
  full_review: {
    strategyId: "humanized_literary",
    strategySettings: { voicePreservation: 85, literaryIntensity: 70 },
  },
  make_shorter: {
    strategyId: "downsize_abridge",
    strategySettings: { targetReductionPercent: 50 },
  },
  make_longer: {
    strategyId: "creative_enhancement",
    strategySettings: { expansionLimitPercent: 40, literaryIntensity: 75 },
  },
};

const MAX_ITERATIONS = 3;
const REWRITE_BATCH_SIZE = 40;

type Props = {
  bookId: string;
  bookTitle: string;
  jobId: string;
  mode: Mode;
  onDone: () => void;
};

export function AutoReviewRunner({ bookId, bookTitle, jobId, mode, onDone }: Props) {
  const stages = buildStages();
  const [stageStates, setStageStates] = useState<StageState[]>(
    stages.map((s) => ({ ...s, status: "pending" })),
  );
  const [iteration, setIteration] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportId, setExportId] = useState<string | null>(null);
  const runningRef = useRef(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  function setStatus(stageId: string, status: StageStatus, detail?: string) {
    setStageStates((prev) =>
      prev.map((s) => (s.id === stageId ? { ...s, status, detail } : s)),
    );
  }

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  async function callApi(path: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(path, {
      method: body !== undefined ? "POST" : "GET",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    if (!res.ok || data.error) return { ok: false, data };
    return { ok: true, data };
  }

  async function advanceJob(stage: string, logEntry?: Record<string, unknown>) {
    await fetch(`/api/books/${bookId}/auto-review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, stage, logEntry }),
    });
  }

  async function runStage(stageId: string): Promise<boolean> {
    setStatus(stageId, "running");
    addLog(`Starting: ${stageId}`);

    try {
      let result: { ok: boolean; data: Record<string, unknown> };

      if (stageId === "analyze") {
        result = await callApi(`/api/books/${bookId}/analyze`, {});
        if (!result.ok) throw new Error(String(result.data.error || "Analyze failed"));

      } else if (stageId === "summarize") {
        result = await callApi(`/api/books/${bookId}/chapters/summarize`, {});
        if (!result.ok) throw new Error(String(result.data.error || "Summarize failed"));

      } else if (stageId.startsWith("critic_baseline:")) {
        const lens = stageId.split(":")[1];
        result = await callApi(`/api/books/${bookId}/critic`, { lens, stage: "baseline" });
        if (!result.ok) throw new Error(String(result.data.error || `Critic ${lens} failed`));

      } else if (stageId === "rewrite_plan") {
        result = await callApi(`/api/books/${bookId}/rewrite-plan`, {});
        if (!result.ok) throw new Error(String(result.data.error || "Rewrite plan failed"));

      } else if (stageId === "rewrite_execute") {
        const strategy = STRATEGY_BY_MODE[mode];
        let batchResult = { ok: true, data: {} as Record<string, unknown> };
        let totalUnitsProcessed = 0;
        let batchNumber = 0;

        // Keep batching until nothing is left or we hit a reasonable cap
        for (let i = 0; i < 200; i++) {
          batchResult = await callApi(`/api/books/${bookId}/rewrite-execute`, {
            maxUnits: REWRITE_BATCH_SIZE,
            ...strategy,
            distributeAcrossChapters: true,
          });
          if (!batchResult.ok) throw new Error(String(batchResult.data.error || "Rewrite execute failed"));

          const content = batchResult.data.content as Record<string, unknown> | undefined;
          const unitsInBatch = (content?.unitsProcessed as number) || (content?.processed as number) || 0;
          totalUnitsProcessed += unitsInBatch;
          batchNumber++;

          addLog(`Rewrite batch ${batchNumber}: ${unitsInBatch} paragraph(s) processed`);
          setStatus(stageId, "running", `Batch ${batchNumber} · ${totalUnitsProcessed} total`);

          // Stop when the batch produced no new work (nothing left to rewrite)
          if (unitsInBatch === 0) break;
        }
        result = batchResult;

      } else if (stageId === "auto_accept") {
        result = await callApi(`/api/books/${bookId}/auto-revision`, {
          action: "run",
          trustProfile: "full_trust",
          maxDecisions: 5000,
        });
        if (!result.ok) throw new Error(String(result.data.error || "Auto-accept failed"));
        const content = result.data.content as Record<string, unknown> | undefined;
        const applied = content?.applied as Record<string, number> | undefined;
        if (applied) {
          addLog(`Auto-accepted: ${applied.accepted} · rejected: ${applied.rejected} · redo: ${applied.redo}`);
        }

      } else if (stageId === "drift_check") {
        result = await callApi(`/api/books/${bookId}/drift-check`, {});
        if (!result.ok) throw new Error(String(result.data.error || "Drift check failed"));

      } else if (stageId.startsWith("critic_post:")) {
        const lens = stageId.split(":")[1];
        result = await callApi(`/api/books/${bookId}/critic`, { lens, stage: "post_rewrite" });
        if (!result.ok) throw new Error(String(result.data.error || `Post-critic ${lens} failed`));

      } else if (stageId === "critics_check") {
        result = await callApi(`/api/books/${bookId}/auto-review/critics-check`);
        if (!result.ok) throw new Error(String(result.data.error || "Critics check failed"));
        const { allGreen, greenCount, total, avgScore } = result.data as {
          allGreen: boolean;
          greenCount: number;
          total: number;
          avgScore: number | null;
        };
        addLog(
          `Quality gate: ${greenCount}/${total} critics green · avg score ${avgScore ?? "N/A"} — ${allGreen ? "ALL GREEN ✓" : "need another cycle"}`,
        );

        if (!allGreen && iteration < MAX_ITERATIONS - 1) {
          // Loop: reset post-critic + execute stages, bump iteration
          const nextIteration = iteration + 1;
          setIteration(nextIteration);
          addLog(`Starting rewrite iteration ${nextIteration + 1}…`);

          // Mark critics_check as skipped for now, requeue the loop stages
          setStatus(stageId, "skipped", `Loop → iteration ${nextIteration + 1}`);
          await advanceJob(stageId, { result: "loop", iteration: nextIteration });

          // Reset the rewrite+post-critic stages to pending for the next loop
          const loopStages = ["rewrite_execute", "auto_accept", "drift_check",
            ...CRITIC_LENSES.map((l) => `critic_post:${l}`), "critics_check"];
          setStageStates((prev) =>
            prev.map((s) => loopStages.includes(s.id) ? { ...s, status: "pending", detail: undefined } : s),
          );

          // Re-run the loop
          for (const loopStageId of loopStages) {
            const ok = await runStage(loopStageId);
            if (!ok) return false;
          }
          return true;
        }

        if (allGreen) {
          setStatus(stageId, "done", `${greenCount}/${total} green · avg ${avgScore}`);
        } else {
          // Max iterations reached, continue anyway
          setStatus(stageId, "done", `${greenCount}/${total} green after ${MAX_ITERATIONS} cycles`);
          addLog(`Max iterations (${MAX_ITERATIONS}) reached — proceeding to export.`);
        }
        await advanceJob(stageId, { allGreen, greenCount, total, avgScore, iteration });
        return true;

      } else if (stageId === "export") {
        result = await callApi(`/api/books/${bookId}/export`, {
          format: "docx",
          sourceMode: "accepted",
          includeFrontMatter: true,
          includeBackMatter: true,
        });
        if (!result.ok) throw new Error(String(result.data.error || "Export failed"));
        const exportData = result.data as Record<string, unknown>;
        const eid = (exportData.exportId as string) || ((exportData.export as { id?: string } | null)?.id) || null;
        if (eid) setExportId(eid);

      } else if (stageId === "mark_finished") {
        result = await callApi(`/api/books/${bookId}/mark-finished`, {
          exportId: exportId || null,
        });
        if (!result.ok) throw new Error(String(result.data.error || "Mark finished failed"));

      } else {
        addLog(`Unknown stage: ${stageId} — skipping`);
        setStatus(stageId, "skipped");
        return true;
      }

      setStatus(stageId, "done");
      await advanceJob(stageId);
      addLog(`✓ Done: ${stageId}`);
      return true;

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(stageId, "failed", msg);
      addLog(`✗ Failed: ${stageId} — ${msg}`);
      return false;
    }
  }

  useEffect(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    (async () => {
      for (const stage of stages) {
        const ok = await runStage(stage.id);
        if (!ok) {
          setFailed(true);
          setErrorMsg(`Failed at stage: ${stage.id}`);
          await callApi(`/api/books/${bookId}/auto-review`, {
            jobId,
            failed: true,
            error: `Failed at stage: ${stage.id}`,
          });
          return;
        }
      }
      setDone(true);
      await callApi(`/api/books/${bookId}/auto-review`, { jobId, completed: true });
      addLog("🎉 All done! Your book is published.");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doneCount = stageStates.filter((s) => s.status === "done" || s.status === "skipped").length;
  const progress = Math.round((doneCount / stages.length) * 100);
  const currentStage = stageStates.find((s) => s.status === "running");

  const groups = Array.from(new Set(stages.map((s) => s.group)));

  return (
    <Stack gap="md">
      <div>
        <Title order={4}>{bookTitle}</Title>
        <Text size="sm" c="dimmed">
          {done ? "Published!" : failed ? "Failed" : `Running — ${currentStage?.label || "…"}`}
        </Text>
      </div>

      <Progress
        value={progress}
        color={done ? "green" : failed ? "red" : "grape"}
        size="md"
        radius="xl"
        animated={!done && !failed}
      />

      {done && (
        <Alert color="green" icon={<IconTrophy size={18} />} title="Book Published!">
          All critics passed. Your book has been exported and marked as finished.
        </Alert>
      )}

      {failed && (
        <Alert color="red" icon={<IconX size={18} />} title="Workflow failed">
          {errorMsg}. Fix the issue (e.g., check LM Studio is running) and restart the wizard.
        </Alert>
      )}

      {/* Stage list by group */}
      <ScrollArea h={340}>
        <Stack gap="xs">
          {groups.map((group) => (
            <div key={group}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>{group}</Text>
              <Stack gap={4}>
                {stageStates
                  .filter((s) => s.group === group)
                  .map((s) => (
                    <Paper key={s.id} withBorder={false} py={4} px="sm" radius="sm"
                      style={{
                        background: s.status === "running" ? "var(--mantine-color-grape-0)" :
                          s.status === "done" ? "var(--mantine-color-green-0)" :
                          s.status === "failed" ? "var(--mantine-color-red-0)" : "transparent",
                      }}
                    >
                      <Group gap="xs" wrap="nowrap">
                        <StageIcon status={s.status} />
                        <Text size="sm" fw={s.status === "running" ? 600 : 400} style={{ flex: 1 }}>
                          {s.label}
                        </Text>
                        {s.detail && (
                          <Text size="xs" c="dimmed" style={{ maxWidth: 180 }} lineClamp={1}>
                            {s.detail}
                          </Text>
                        )}
                        <Badge
                          size="xs"
                          color={
                            s.status === "done" ? "green" :
                            s.status === "running" ? "grape" :
                            s.status === "failed" ? "red" :
                            s.status === "skipped" ? "yellow" : "gray"
                          }
                          variant="light"
                        >
                          {s.status}
                        </Badge>
                      </Group>
                    </Paper>
                  ))}
              </Stack>
            </div>
          ))}
        </Stack>
      </ScrollArea>

      {/* Log */}
      <Paper withBorder radius="sm" p="sm" bg="#0f0f0f" ff="monospace">
        <ScrollArea h={120}>
          <div ref={logRef}>
          {log.map((line, i) => (
            <Text key={i} size="xs" c="green.4">{line}</Text>
          ))}
          {!done && !failed && <Text size="xs" c="dimmed">…</Text>}
          </div>
        </ScrollArea>
      </Paper>

      {iteration > 0 && (
        <Group>
          <Badge color="grape" variant="light">Rewrite cycle {iteration + 1} of {MAX_ITERATIONS}</Badge>
        </Group>
      )}

      <Group justify="flex-end">
        {(done || failed) && (
          <Button color={done ? "green" : "gray"} onClick={onDone} leftSection={done ? <IconCheck size={16} /> : undefined}>
            {done ? "Close & Go to Book" : "Close"}
          </Button>
        )}
        {!done && !failed && (
          <Group gap="xs">
            <Loader size="xs" color="grape" />
            <Text size="sm" c="dimmed">Running autonomously — no action needed</Text>
          </Group>
        )}
      </Group>
    </Stack>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "done") return <ThemeIcon size="xs" color="green" variant="light" radius="xl"><IconCheck size={10} /></ThemeIcon>;
  if (status === "failed") return <ThemeIcon size="xs" color="red" variant="light" radius="xl"><IconX size={10} /></ThemeIcon>;
  if (status === "running") return <Loader size="xs" color="grape" type="dots" />;
  if (status === "skipped") return <ThemeIcon size="xs" color="yellow" variant="light" radius="xl"><IconPlayerPlay size={10} /></ThemeIcon>;
  return <ThemeIcon size="xs" color="gray" variant="light" radius="xl"><Box w={6} h={6} style={{ borderRadius: "50%", background: "currentColor" }} /></ThemeIcon>;
}
