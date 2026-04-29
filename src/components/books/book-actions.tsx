"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Divider, Paper, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AiJobQueue, type AiJobQueueState } from "@/components/ai/ai-job-queue";
import { AiTaskPreflight, type AiTaskPreflightData } from "@/components/ai/ai-task-preflight";
import { estimateAiCallPlan } from "@/lib/ai/call-planner";
import { criticLenses } from "@/lib/critic/prompts";
import { fetchJson } from "@/lib/http/fetch-json";
import type { CriticLens } from "@/lib/types";

type AiDashboardTask = "book-bible" | "critic" | "chapter-summaries";

type PendingTask = {
  path: string;
  body?: unknown;
  preflight: AiTaskPreflightData;
};

type ModelStatusResponse = {
  connected: boolean;
  qualityProfile: string;
  contextWindowTokens: number;
  temperature: number;
  maxOutputTokens: number;
  configuredModels: Array<{ key: string; label: string; model: string; available: boolean }>;
  warnings: string[];
};

export function BookActions({
  bookId,
  chapterCount,
  sceneCount,
  paragraphCount,
}: {
  bookId: string;
  chapterCount: number;
  sceneCount: number;
  paragraphCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [lens, setLens] = useState<CriticLens>("revision_priorities");
  const [output, setOutput] = useState("");
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);
  const [queue, setQueue] = useState<AiJobQueueState>({
    currentTask: "",
    currentUnit: "",
    totalUnits: 0,
    completedUnits: 0,
    successfulUnits: 0,
    failedUnits: 0,
    skippedUnits: 0,
    status: "idle",
  });

  async function getModelStatus(): Promise<ModelStatusResponse> {
    return fetchJson<ModelStatusResponse>(
      "/api/lmstudio/status",
      { cache: "no-store" },
      "LM Studio model status check",
    );
  }

  async function openPreflight(task: AiDashboardTask) {
    setOutput("");
    setLoading(`preflight:${task}`);
    try {
      const status = await getModelStatus();
      const modelKey = task === "critic" ? "reasoningModel" : "extractionModel";
      const configured = status.configuredModels.find((item) => item.key === modelKey);
      const selectedModel = configured?.model || "";
      const plan = estimateAiCallPlan({
        task: task === "critic" ? "critic" : "book-bible",
        selectedModel,
        qualityProfile: status.qualityProfile,
        contextWindowTokens: status.contextWindowTokens,
        maxOutputTokens: status.maxOutputTokens,
        chapterCount,
        sceneCount,
        paragraphCount,
      });
      const estimatedUnits =
        task === "chapter-summaries"
          ? Math.max(chapterCount, 1)
          : plan.unitStrategy === "paragraphs"
            ? paragraphCount
            : plan.unitStrategy === "scenes"
              ? sceneCount
              : Math.max(chapterCount, 1);
      const expectedAiCalls = task === "chapter-summaries" ? Math.max(chapterCount, 1) : plan.expectedCalls;
      const warnings = [
        ...status.warnings,
        ...plan.warnings,
        ...(selectedModel ? [] : [`${configured?.label || "Required"} model is not configured.`]),
        ...(paragraphCount > 0 && task === "book-bible"
          ? [
              `This book has ${chapterCount.toLocaleString()} chapters, ${sceneCount.toLocaleString()} scenes, and ${paragraphCount.toLocaleString()} paragraphs. BookForge will use structured context instead of a whole-book rewrite.`,
            ]
          : []),
        ...(task === "chapter-summaries"
          ? [
              "BookForge will make one focused extraction call per chapter so these summaries are reliable reusable context.",
            ]
          : []),
      ];
      const taskPath =
        task === "book-bible"
          ? `/api/books/${bookId}/analyze`
          : task === "chapter-summaries"
            ? `/api/books/${bookId}/chapters/summarize`
            : `/api/books/${bookId}/critic`;

      setPendingTask({
        path: taskPath,
        body: task === "critic" ? { lens } : undefined,
        preflight: {
          taskName:
            task === "book-bible"
              ? "Generate Manuscript Blueprint"
              : task === "chapter-summaries"
                ? "Generate Chapter Summaries"
                : `BookForge Critic: ${criticLenses[lens].label}`,
          taskDescription:
            task === "book-bible"
              ? "Analyze manuscript structure and extract reusable book context for future revisions."
              : task === "chapter-summaries"
                ? "Summarize every chapter for future Manuscript Blueprint, Critic, and revision context."
                : "Evaluate the book through the selected critic lens without rewriting manuscript text.",
          requiredModelType: task === "critic" ? "Reasoning model" : "Extraction model",
          selectedModel,
          lmStudioConnected: status.connected,
          modelAvailable: Boolean(configured?.available),
          estimatedUnits,
          expectedAiCalls,
          qualityProfile: status.qualityProfile,
          contextSize: status.contextWindowTokens,
          temperature: status.temperature,
          maxOutputTokens: status.maxOutputTokens,
          planningMath: plan.math,
          targetTokensPerCall: plan.targetTokensPerCall,
          usableContextTokens: plan.usableContextTokens,
          estimatedSecondsPerCall: plan.estimatedSecondsPerCall,
          estimatedTotalSeconds:
            task === "chapter-summaries" ? plan.estimatedSecondsPerCall * expectedAiCalls : plan.estimatedTotalSeconds,
          unitStrategy: task === "chapter-summaries" ? "chapters" : plan.unitStrategy,
          modelSizeB: plan.modelSizeB,
          quantization: plan.quantization,
          warnings,
        },
      });
    } catch (error) {
      setOutput(JSON.stringify({ error: error instanceof Error ? error.message : "Preflight failed." }, null, 2));
    } finally {
      setLoading(null);
    }
  }

  async function run(path: string, body: unknown, preflight: AiTaskPreflightData | null) {
    setLoading(path);
    setOutput("");
    const taskName = preflight?.taskName || "AI task";
    const totalUnits = preflight?.expectedAiCalls || 1;
    const estimatedSecondsPerCall = preflight?.estimatedSecondsPerCall || 20;
    const startedAt = Date.now();
    setQueue({
      currentTask: taskName,
      currentUnit: unitLabel(totalUnits),
      totalUnits,
      completedUnits: 0,
      successfulUnits: 0,
      failedUnits: 0,
      skippedUnits: 0,
      startedAt,
      estimatedSecondsPerCall,
      elapsedSeconds: 0,
      currentCallElapsedSeconds: 0,
      currentCallProgress: 0,
      nextCallSeconds: totalUnits > 1 ? estimatedSecondsPerCall : null,
      estimatedSecondsRemaining: null,
      estimatedProgress: true,
      status: "running",
    });
    try {
      const result = await fetchJson<{ content?: Record<string, unknown> }>(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body || {}),
      }, taskName);
      setOutput(formatResultMessage(path, result));
      router.refresh();
      setQueue((current) => ({
        ...current,
        currentUnit: "Complete",
        completedUnits: totalUnits,
        successfulUnits: totalUnits,
        elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
        currentCallElapsedSeconds: estimatedSecondsPerCall,
        currentCallProgress: 1,
        nextCallSeconds: 0,
        estimatedSecondsRemaining: 0,
        estimatedProgress: false,
        status: "complete",
      }));
    } catch (error) {
      setOutput(JSON.stringify({ error: error instanceof Error ? error.message : "Request failed." }, null, 2));
      setQueue((current) => ({
        ...current,
        failedUnits: Math.max(1, current.failedUnits),
        completedUnits: Math.min(current.totalUnits, current.completedUnits + 1),
        elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
        currentCallProgress: 0,
        nextCallSeconds: null,
        estimatedProgress: false,
        status: "cancelled",
      }));
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    if (queue.status !== "running" || !queue.startedAt || !queue.estimatedSecondsPerCall) {
      return;
    }

    const interval = window.setInterval(() => {
      setQueue((current) => {
        if (
          current.status !== "running" ||
          !current.startedAt ||
          !current.estimatedSecondsPerCall
        ) {
          return current;
        }

        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000));
        const estimatedCompleted = Math.min(
          Math.max(0, current.totalUnits - 1),
          Math.floor(elapsedSeconds / current.estimatedSecondsPerCall),
        );
        const secondsIntoCurrentCall = elapsedSeconds % current.estimatedSecondsPerCall;
        const currentCallElapsedSeconds =
          current.totalUnits <= 1 ? elapsedSeconds : secondsIntoCurrentCall;
        const currentCallProgress =
          current.totalUnits <= 1
            ? Math.min(0.94, elapsedSeconds / current.estimatedSecondsPerCall)
            : Math.min(0.98, secondsIntoCurrentCall / current.estimatedSecondsPerCall);
        const nextCallSeconds =
          current.totalUnits <= 1 || estimatedCompleted >= current.totalUnits - 1
            ? null
            : Math.max(0, Math.ceil(current.estimatedSecondsPerCall - secondsIntoCurrentCall));
        const averageSecondsPerCall =
          estimatedCompleted >= 2 ? Math.max(1, elapsedSeconds / estimatedCompleted) : current.estimatedSecondsPerCall;
        const remainingCalls = Math.max(0, current.totalUnits - estimatedCompleted);
        const estimatedSecondsRemaining =
          estimatedCompleted >= 2 ? Math.ceil(remainingCalls * averageSecondsPerCall) : null;

        return {
          ...current,
          completedUnits: Math.max(current.completedUnits, estimatedCompleted),
          currentUnit: unitLabel(current.totalUnits, Math.min(current.totalUnits, estimatedCompleted + 1)),
          elapsedSeconds,
          currentCallElapsedSeconds,
          currentCallProgress,
          nextCallSeconds,
          estimatedSecondsRemaining,
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [queue.estimatedProgress, queue.estimatedSecondsPerCall, queue.startedAt, queue.status]);

  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, lg: 3 }}>
        <ActionPanel
          title="Prepare Context"
          description="Build reusable manuscript context before revision."
        >
          <Button
            color="grape"
            fullWidth
            loading={loading === "preflight:book-bible" || loading === `/api/books/${bookId}/analyze`}
            onClick={() => openPreflight("book-bible")}
          >
            Generate Manuscript Blueprint
          </Button>
          <Button
            fullWidth
            variant="light"
            color="teal"
            loading={
              loading === "preflight:chapter-summaries" ||
              loading === `/api/books/${bookId}/chapters/summarize`
            }
            onClick={() => openPreflight("chapter-summaries")}
          >
            Generate Chapter Summaries
          </Button>
        </ActionPanel>

        <ActionPanel
          title="BookForge Critic"
          description="Choose a lens, then run the matching evaluation."
        >
          <Select
            label="Critic lens"
            value={lens}
            onChange={(value) => setLens((value as CriticLens) || "revision_priorities")}
            data={Object.entries(criticLenses).map(([value, item]) => ({ value, label: item.label }))}
          />
          <Button
            fullWidth
            variant="light"
            color="grape"
            loading={loading === "preflight:critic" || loading === `/api/books/${bookId}/critic`}
            onClick={() => openPreflight("critic")}
          >
            Run Selected Critic Lens
          </Button>
        </ActionPanel>

        <ActionPanel
          title="Rewrite & Export"
          description="Move from architecture to reviewable drafts and final files."
        >
          <Button component={Link} href={`/books/${bookId}/rewrite-plan`} color="dark" variant="light" fullWidth>
            Rewrite Architect
          </Button>
          <Button component={Link} href={`/books/${bookId}/revisions`} color="teal" variant="light" fullWidth>
            Review Draft Revisions
          </Button>
          <Button component={Link} href={`/books/${bookId}/final-manuscript`} color="green" variant="light" fullWidth>
            Final Manuscript Builder
          </Button>
        </ActionPanel>
      </SimpleGrid>

      <Divider />

      <AiJobQueue
        job={queue}
        onPause={() => setQueue((current) => ({ ...current, status: "paused" }))}
        onResume={() => setQueue((current) => ({ ...current, status: "running" }))}
        onCancel={() => setQueue((current) => ({ ...current, status: "cancelled" }))}
        onRetryFailed={() =>
          setQueue((current) => ({
            ...current,
            failedUnits: 0,
            skippedUnits: 0,
            status: current.currentTask ? "running" : "idle",
          }))
        }
      />
      {output && (
        <Alert color={output.startsWith("Error:") ? "red" : "green"} title="Latest result">
          {output}
        </Alert>
      )}
      <AiTaskPreflight
        opened={Boolean(pendingTask)}
        data={pendingTask?.preflight || null}
        loading={Boolean(pendingTask && loading === pendingTask.path)}
        onCancel={() => setPendingTask(null)}
        onProceed={() => {
          if (!pendingTask) return;
          const task = pendingTask;
          setPendingTask(null);
          void run(task.path, task.body || {}, task.preflight);
        }}
      />
    </Stack>
  );
}

function ActionPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="lg" bg="#fbfaf8">
      <Stack>
        <div>
          <Title order={3}>{title}</Title>
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        </div>
        {children}
      </Stack>
    </Paper>
  );
}

function unitLabel(totalUnits: number, current = 1) {
  if (totalUnits <= 1) return "Single model call";
  return `Estimated call ${current} of ${totalUnits}`;
}

function formatResultMessage(path: string, result: { content?: Record<string, unknown> }) {
  const plan = result.content?.aiCallPlan as
    | { actualCalls?: number; expectedCalls?: number; chunkCount?: number; unitStrategy?: string }
    | undefined;

  if (path.includes("/analyze")) {
    const calls = plan?.actualCalls || plan?.chunkCount || plan?.expectedCalls;
    return calls
      ? `Manuscript Blueprint saved. Processed with ${calls} AI call(s) using ${plan?.unitStrategy || "planned"} chunking.`
      : "Manuscript Blueprint saved.";
  }

  if (path.includes("/critic")) {
    return "BookForge Critic report saved.";
  }

  if (path.includes("/chapters/summarize")) {
    const summarized = result.content?.summarized;
    return `Chapter summaries saved.${typeof summarized === "number" ? ` Summarized ${summarized} chapter(s).` : ""}`;
  }

  return "Task completed and saved.";
}
