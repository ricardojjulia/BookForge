"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Divider, Group, Modal, Paper, Select, SimpleGrid, Stack, Switch, Text, Title } from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AiJobQueue, type AiJobQueueState } from "@/components/ai/ai-job-queue";
import { AiTaskPreflight, type AiTaskPreflightData } from "@/components/ai/ai-task-preflight";
import { estimateAiCallPlan } from "@/lib/ai/call-planner";
import { criticLenses } from "@/lib/critic/prompts";
import { fetchJson } from "@/lib/http/fetch-json";
import { mergeMetadataSnapshotBody } from "@/lib/book-metadata/selection";
import type { CriticLens } from "@/lib/types";

type AiDashboardTask = "book-bible" | "critic" | "critic-all" | "chapter-summaries" | "generate-draft" | "auto-review";

type PendingTask = {
  path: string;
  body?: unknown;
  preflight: AiTaskPreflightData;
  kind?: "single" | "auto-review";
};

type ModelStatusResponse = {
  connected: boolean;
  qualityProfile: string;
  contextWindowTokens: number;
  temperature: number;
  maxOutputTokens: number;
  runtimeLimits?: Record<
    string,
    {
      configuredContextTokens: number;
      maxOutputTokens: number;
      reservedTokens: number;
      usableInputTokens: number;
      promptCharBudget: number;
      warnings: string[];
    }
  >;
  configuredModels: Array<{ key: string; label: string; model: string; available: boolean }>;
  warnings: string[];
  cloudProvider?: {
    provider: string;
    model: string | null;
    executionMode: string;
    usedForPlanning: boolean;
    usedForRewrite: boolean;
  } | null;
};

type AutoRevisionResponse = {
  content?: {
    applied?: {
      accepted?: number;
      rejected?: number;
      redo?: number;
    };
    decisions?: {
      total?: number;
      accept?: number;
      reject?: number;
      redo?: number;
    };
    nextStep?: string;
  };
};

type AutoReviewCounts = {
  accepted?: number;
  accept?: number;
  rejected?: number;
  reject?: number;
  redo?: number;
};

type AutoReviewStatusResponse = {
  content?: {
    hasBlueprint?: boolean;
    hasChapterSummaries?: boolean;
    hasBaselineCriticBatch?: boolean;
    hasRewritePlan?: boolean;
    hasAutoRevisionDecisions?: boolean;
    hasPostRewriteCriticBatch?: boolean;
    pendingRevisionCount?: number;
    revisionCount?: number;
  };
};

type AutoReviewJobSummary = {
  id: string;
  mode: "full_review" | "make_shorter" | "make_longer";
  status: "running" | "completed" | "failed" | "cancelled";
  completed_at: string | null;
  created_at: string;
};

type AutoReviewJobResponse = {
  job?: AutoReviewJobSummary | null;
};

const autoReviewStrategies = [
  "conservative_polish",
  "humanized_literary",
  "clarity_readability",
  "emotional_depth",
  "contemporary_view",
  "creative_enhancement",
] as const;

const autoReviewTrustProfiles = ["careful", "balanced", "full_trust"] as const;

export function BookActions({
  bookId,
  chapterCount,
  sceneCount,
  paragraphCount,
  plannedChapterCount = 0,
}: {
  bookId: string;
  chapterCount: number;
  sceneCount: number;
  paragraphCount: number;
  plannedChapterCount?: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [lens, setLens] = useState<CriticLens>("revision_priorities");
  const [output, setOutput] = useState("");
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);
  const [pendingGuardTask, setPendingGuardTask] = useState<AiDashboardTask | null>(null);
  const [latestAutoReviewJob, setLatestAutoReviewJob] = useState<AutoReviewJobSummary | null>(null);
  // Starts false on both server and the client's first render -- reading
  // localStorage inside the useState initializer runs on the client's
  // initial render too (not just the server), and if the user had
  // previously toggled this on, that first client render would return true
  // while the server-rendered HTML was built with false, diverging the
  // entire "AI Job Queue" subtree (Alert vs Paper) and the Switch's checked
  // state -- a hydration mismatch. Deferring the real value to a
  // post-mount effect keeps the first client render identical to the SSR
  // output.
  const [alwaysShowDetailedQueue, setAlwaysShowDetailedQueue] = useState(false);
  const detailedQueuePrefHydrated = useRef(false);

  useEffect(() => {
    setAlwaysShowDetailedQueue(window.localStorage.getItem("bookforge.alwaysShowDetailedQueue") === "1");
    detailedQueuePrefHydrated.current = true;
  }, []);
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

  useEffect(() => {
    if (!detailedQueuePrefHydrated.current) return;
    window.localStorage.setItem("bookforge.alwaysShowDetailedQueue", alwaysShowDetailedQueue ? "1" : "0");
  }, [alwaysShowDetailedQueue]);

  useEffect(() => {
    let cancelled = false;

    async function loadLatestAutoReviewJob() {
      try {
        const result = await fetchJson<AutoReviewJobResponse>(
          `/api/books/${bookId}/auto-review`,
          { cache: "no-store" },
          "Auto-review latest job status",
        );
        if (!cancelled) {
          setLatestAutoReviewJob(result.job || null);
        }
      } catch {
        if (!cancelled) {
          setLatestAutoReviewJob(null);
        }
      }
    }

    void loadLatestAutoReviewJob();
    const interval = window.setInterval(() => {
      void loadLatestAutoReviewJob();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [bookId]);

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
      const modelKey =
        task === "critic" || task === "critic-all" || task === "auto-review"
          ? "reasoningModel"
          : task === "generate-draft"
            ? "primaryRewriteModel"
            : "extractionModel";
      const configured = status.configuredModels.find((item) => item.key === modelKey);
      const selectedModel = configured?.model || "";
      const runtimeTask =
        task === "auto-review" || task === "critic" || task === "critic-all"
          ? "critic"
          : task === "generate-draft"
            ? "rewrite"
            : "extraction";
      // status.connected/configured.available only reflect LOCAL LM Studio
      // reachability, so every AI Task Preflight modal's "Proceed" button was
      // permanently disabled for accounts configured to use a cloud provider
      // (e.g. OpenRouter) — local LM Studio was never expected to be running
      // for them. Treat the account as ready when its cloud provider is
      // actually the active path for this task's model kind.
      const isCloudReadyForTask = Boolean(
        status.cloudProvider?.model &&
          (runtimeTask === "rewrite" ? status.cloudProvider.usedForRewrite : status.cloudProvider.usedForPlanning),
      );
      const runtimeLimits = status.runtimeLimits?.[runtimeTask] || status.runtimeLimits?.planning;
      const plan = estimateAiCallPlan({
        task: task === "critic" || task === "critic-all" || task === "auto-review" ? "critic" : "book-bible",
        selectedModel,
        qualityProfile: status.qualityProfile,
        contextWindowTokens: runtimeLimits?.configuredContextTokens || status.contextWindowTokens,
        maxOutputTokens: runtimeLimits?.maxOutputTokens || status.maxOutputTokens,
        chapterCount,
        sceneCount,
        paragraphCount,
      });
      const autoReviewRewriteUnits = Math.min(Math.max(paragraphCount, 1), 5000);
      const estimatedUnits =
        task === "auto-review"
          ? 9
          : task === "critic-all"
          ? 7
          : task === "generate-draft"
          ? Math.min(Math.max(plannedChapterCount, 1), 3)
          : task === "chapter-summaries"
          ? Math.max(chapterCount, 1)
          : plan.unitStrategy === "paragraphs"
            ? paragraphCount
            : plan.unitStrategy === "scenes"
              ? sceneCount
              : Math.max(chapterCount, 1);
      const expectedAiCalls =
        task === "auto-review"
          ? 9
          : task === "critic-all"
          ? 7
          : task === "generate-draft"
          ? Math.min(Math.max(plannedChapterCount, 1), 3)
          : task === "chapter-summaries"
            ? Math.max(chapterCount, 1)
            : plan.expectedCalls;
      const warnings = [
        ...status.warnings,
        ...(runtimeLimits?.warnings || []),
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
        ...(task === "critic-all"
          ? [
              "BookForge will run all seven baseline Critic lenses. This is the fastest way to clear rewrite-planning Critic coverage.",
            ]
          : []),
        ...(task === "auto-review"
          ? [
              "Auto Review will run blueprint, chapter summaries, baseline Critic, rewrite planning, paragraph rewriting, random accept/reject/redo decisions, a redo pass when needed, and post-rewrite Critic.",
              `The paragraph rewrite step can still process up to ${autoReviewRewriteUnits.toLocaleString()} paragraph unit(s) inside the rewrite job.`,
              "The reviewer intentionally randomizes trust profile, rewrite strategy, distribution mode, and accept/reject/redo outcomes so the run can explore unknowns instead of deterministically approving every draft.",
            ]
          : []),
        ...(task === "generate-draft"
          ? [
              "BookForge will generate only a small batch of planned chapter shells in this run. Continue running batches until all planned chapters have prose.",
              "Generated prose becomes the first-draft original text for AI-created books; imported manuscript originals are not affected.",
            ]
          : []),
      ];
      const taskPath =
        task === "book-bible"
          ? `/api/books/${bookId}/analyze`
          : task === "auto-review"
            ? `/api/books/${bookId}/auto-review`
          : task === "chapter-summaries"
            ? `/api/books/${bookId}/chapters/summarize`
            : task === "critic-all"
              ? `/api/books/${bookId}/critic/all`
            : task === "generate-draft"
              ? `/api/books/${bookId}/generate-draft`
              : `/api/books/${bookId}/critic`;

      setPendingTask({
        path: taskPath,
        body: task === "critic" ? { lens } : task === "critic-all" ? { stage: "baseline" } : undefined,
        preflight: {
          taskName:
            task === "book-bible"
              ? "Generate Manuscript Blueprint"
              : task === "auto-review"
                ? "Auto Review Full Book"
              : task === "chapter-summaries"
                ? "Generate Chapter Summaries"
                : task === "critic-all"
                  ? "Run all BookForge Critic lenses"
                : task === "generate-draft"
                  ? "Generate Planned Draft"
                : `BookForge Critic: ${criticLenses[lens].label}`,
          taskDescription:
            task === "book-bible"
              ? "Analyze manuscript structure and extract reusable book context for future revisions."
              : task === "auto-review"
                ? "Run the full guided review workflow automatically, including randomized rewrite choices and random accept/reject/redo decisions for draft paragraph revisions."
              : task === "chapter-summaries"
                ? "Summarize every chapter for future Manuscript Blueprint, Critic, and revision context."
                : task === "critic-all"
                  ? "Evaluate the book through every baseline Critic lens required for rewrite planning."
                : task === "generate-draft"
                  ? "Write prose for planned AI-created chapter shells using the accepted Creation Wizard architecture."
                : "Evaluate the book through the selected critic lens without rewriting manuscript text.",
          requiredModelType:
            task === "critic" || task === "critic-all" || task === "auto-review"
              ? "Reasoning model"
              : task === "generate-draft"
                ? "Primary rewrite model"
                : "Extraction model",
          selectedModel,
          lmStudioConnected: status.connected || isCloudReadyForTask,
          modelAvailable: Boolean(configured?.available) || isCloudReadyForTask,
          estimatedUnits,
          expectedAiCalls,
          qualityProfile: status.qualityProfile,
          contextSize: status.contextWindowTokens,
          temperature: status.temperature,
          maxOutputTokens: runtimeLimits?.maxOutputTokens || status.maxOutputTokens,
          planningMath:
            task === "auto-review"
              ? [
                  "Auto Review is tracked as 9 workflow steps:",
                  "1. Manuscript Blueprint",
                  "2. Chapter summaries",
                  "3. Baseline Critic lenses",
                  "4. Rewrite Architect plan",
                  "5. Paragraph rewrite job",
                  "6. Random accept/reject/redo review",
                  "7. Redo rewrite job when needed",
                  "8. Random redo review when needed",
                  "9. Post-rewrite Critic lenses",
                  "",
                  `Paragraph work still happens inside the rewrite job: up to ${autoReviewRewriteUnits.toLocaleString()} paragraph unit(s).`,
                ].join("\n")
              : plan.math,
          targetTokensPerCall: plan.targetTokensPerCall,
          usableContextTokens: runtimeLimits?.usableInputTokens || plan.usableContextTokens,
          estimatedSecondsPerCall: plan.estimatedSecondsPerCall,
          estimatedTotalSeconds:
            task === "auto-review"
              ? plan.estimatedSecondsPerCall * 9
              : task === "chapter-summaries" || task === "generate-draft"
                ? plan.estimatedSecondsPerCall * expectedAiCalls
                : plan.estimatedTotalSeconds,
          unitStrategy:
            task === "auto-review"
              ? "full workflow"
              : task === "chapter-summaries" || task === "generate-draft"
                ? "chapters"
                : plan.unitStrategy,
          modelSizeB: plan.modelSizeB,
          quantization: plan.quantization,
          warnings,
        },
        kind: task === "auto-review" ? "auto-review" : "single",
      });
    } catch (error) {
      setOutput(JSON.stringify({ error: error instanceof Error ? error.message : "Preflight failed." }, null, 2));
    } finally {
      setLoading(null);
    }
  }

  function requiresPostAutoReviewConfirmation(task: AiDashboardTask) {
    return task === "book-bible" || task === "chapter-summaries" || task === "critic" || task === "critic-all";
  }

  function requestTask(task: AiDashboardTask) {
    if (latestAutoReviewJob?.status === "completed" && requiresPostAutoReviewConfirmation(task)) {
      setPendingGuardTask(task);
      return;
    }
    void openPreflight(task);
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

  async function runAutoReview(preflight: AiTaskPreflightData | null) {
    const totalUnits = 9;
    const estimatedSecondsPerCall = preflight?.estimatedSecondsPerCall || 25;
    const startedAt = Date.now();
    let completedUnits = 0;

    function setAutoQueue(currentUnit: string, status: AiJobQueueState["status"] = "running") {
      setQueue({
        currentTask: "Auto Review Full Book",
        currentUnit,
        totalUnits,
        completedUnits,
        successfulUnits: completedUnits,
        failedUnits: 0,
        skippedUnits: 0,
        startedAt,
        estimatedSecondsPerCall,
        elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
        currentCallElapsedSeconds: 0,
        currentCallProgress: status === "complete" ? 1 : 0.2,
        nextCallSeconds: status === "running" ? estimatedSecondsPerCall : 0,
        estimatedSecondsRemaining: status === "running" ? Math.max(0, (totalUnits - completedUnits) * estimatedSecondsPerCall) : 0,
        estimatedProgress: false,
        status,
      });
    }

    async function post<T = { content?: Record<string, unknown> }>(path: string, body: unknown, label: string) {
      setAutoQueue(label);
      const payload = (body || {}) as Record<string, unknown>;
      const isAutoRevisionPreview = path.includes("/auto-revision") && payload.action === "preview";

      if (supportsServerManagedHandoff(path) && !isAutoRevisionPreview) {
        const queued = await fetchJson<{ content?: { jobId?: string } }>(
          path,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...payload, serverManaged: true }),
          },
          `${label} (queue)`,
        );
        const jobId = queued.content?.jobId;
        if (!jobId) {
          throw new Error(`Queue handoff failed for ${label}.`);
        }

        const resumed = await fetchJson<T>(
          path,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...payload, jobId }),
          },
          label,
        );
        completedUnits = Math.min(totalUnits, completedUnits + 1);
        return resumed;
      }

      const result = await fetchJson<T>(
        path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mergeMetadataSnapshotBody((payload || {}) as Record<string, unknown>)),
        },
        label,
      );
      completedUnits = Math.min(totalUnits, completedUnits + 1);
      return result;
    }

    function supportsServerManagedHandoff(path: string) {
      return (
        path.includes("/analyze") ||
        path.includes("/chapters/summarize") ||
        path.includes("/critic") ||
        path.includes("/rewrite-plan") ||
        path.includes("/rewrite-execute") ||
        path.includes("/auto-revision") ||
        path.includes("/drift-check")
      );
    }

    function skipCompleted(label: string) {
      completedUnits = Math.min(totalUnits, completedUnits + 1);
      setAutoQueue(`${label} already complete`);
    }

    setLoading("auto-review");
    setOutput("");
    setAutoQueue("Starting full workflow");

    try {
      const initialStatus = await fetchJson<AutoReviewStatusResponse>(
        `/api/books/${bookId}/auto-review/status`,
        { cache: "no-store" },
        "Auto Review status check",
      );
      const status = initialStatus.content || {};

      if (status.hasBlueprint) skipCompleted("Manuscript Blueprint");
      else await post(`/api/books/${bookId}/analyze`, {}, "Generating Manuscript Blueprint");

      if (status.hasChapterSummaries) skipCompleted("Chapter summaries");
      else await post(`/api/books/${bookId}/chapters/summarize`, {}, "Generating chapter summaries");

      if (status.hasBaselineCriticBatch) skipCompleted("Baseline Critic lenses");
      else await post(`/api/books/${bookId}/critic/all`, { stage: "baseline" }, "Running baseline Critic lenses");

      if (status.hasRewritePlan) skipCompleted("Rewrite Architect plan");
      else await post(`/api/books/${bookId}/rewrite-plan`, {}, "Creating Rewrite Architect plan");

      const firstStrategy = randomItem(autoReviewStrategies);
      const firstTrustProfile = randomItem(autoReviewTrustProfiles);
      if ((status.pendingRevisionCount || 0) > 0) {
        skipCompleted("Paragraph rewrite job");
      } else {
        await post(
          `/api/books/${bookId}/rewrite-execute`,
          {
            maxUnits: Math.min(Math.max(paragraphCount, 1), 5000),
            strategyId: firstStrategy,
            distributeAcrossChapters: Math.random() >= 0.35,
            coverageMode: Math.random() >= 0.5 ? "uncovered_chapter_sample" : "normal",
          },
          `Rewriting paragraphs with ${firstStrategy.replaceAll("_", " ")}`,
        );
      }

      const firstReview =
        status.hasAutoRevisionDecisions && (status.pendingRevisionCount || 0) === 0
          ? (skipCompleted("Random accept/reject/redo review"), null)
          : await post<AutoRevisionResponse>(
              `/api/books/${bookId}/auto-revision`,
              {
                action: "run",
                trustProfile: firstTrustProfile,
                maxDecisions: Math.min(Math.max(paragraphCount, 1), 5000),
              },
              `Randomly accepting, rejecting, or redoing drafts with ${firstTrustProfile.replaceAll("_", " ")} trust`,
            );

      const redoCount =
        (firstReview?.content?.applied?.redo || firstReview?.content?.decisions?.redo || 0) +
        (firstReview?.content?.applied?.rejected || firstReview?.content?.decisions?.reject || 0);

      let secondReview: AutoRevisionResponse | null = null;
      if (redoCount > 0) {
        const redoStrategy = randomItem(autoReviewStrategies);
        const redoTrustProfile = randomItem(autoReviewTrustProfiles);
        await post(
          `/api/books/${bookId}/rewrite-execute`,
          {
            maxUnits: Math.min(Math.max(redoCount, 1), 5000),
            rewriteExistingDrafts: true,
            strategyId: redoStrategy,
            distributeAcrossChapters: Math.random() >= 0.35,
            coverageMode: "normal",
          },
          `Redoing ${redoCount} rejected or redo paragraph draft(s)`,
        );
        secondReview = await post<AutoRevisionResponse>(
          `/api/books/${bookId}/auto-revision`,
          {
            action: "run",
            trustProfile: redoTrustProfile,
            maxDecisions: Math.min(Math.max(redoCount, 1), 5000),
          },
          `Randomly reviewing redo drafts with ${redoTrustProfile.replaceAll("_", " ")} trust`,
        );
      } else {
        skipCompleted("Redo rewrite job");
        skipCompleted("Random redo review");
      }

      if (status.hasPostRewriteCriticBatch) skipCompleted("Post-rewrite Critic lenses");
      else await post(`/api/books/${bookId}/critic/all`, { stage: "post_rewrite" }, "Running post-rewrite Critic lenses");

      completedUnits = totalUnits;
      setAutoQueue("Complete", "complete");
      setOutput(formatAutoReviewMessage(firstReview, secondReview));
      router.refresh();
    } catch (error) {
      setOutput(JSON.stringify({ error: error instanceof Error ? error.message : "Auto Review failed." }, null, 2));
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

  async function runQueuedGenerateDraft(preflight: AiTaskPreflightData | null) {
    const path = `/api/books/${bookId}/generate-draft`;
    const totalUnits = Math.max(1, Math.min(plannedChapterCount, 3));
    const estimatedSecondsPerCall = preflight?.estimatedSecondsPerCall || 40;
    const startedAt = Date.now();

    setLoading(path);
    setOutput("");
    setQueue({
      currentTask: "Generate Planned Draft",
      currentUnit: `Queued ${totalUnits} planned chapter(s)`,
      totalUnits,
      completedUnits: 0,
      successfulUnits: 0,
      failedUnits: 0,
      skippedUnits: 0,
      startedAt,
      estimatedSecondsPerCall,
      elapsedSeconds: 0,
      currentCallElapsedSeconds: 0,
      currentCallProgress: 0.1,
      nextCallSeconds: estimatedSecondsPerCall,
      estimatedSecondsRemaining: totalUnits * estimatedSecondsPerCall,
      estimatedProgress: true,
      status: "running",
    });

    try {
      const created = await fetchJson<{ content?: { jobId?: string; queued?: boolean; totalUnits?: number } }>(
        path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mergeMetadataSnapshotBody({ limit: totalUnits, serverManaged: true })),
        },
        "Queue Planned Draft generation",
      );

      const jobId = created.content?.jobId;
      if (!jobId) {
        throw new Error("Draft job was not created.");
      }

      setOutput(`Planned draft queued for ${totalUnits} chapter(s).`);
      setQueue((current) => ({
        ...current,
        currentUnit: `Processing ${totalUnits} planned chapter(s)`,
        status: "running",
        estimatedProgress: true,
      }));

      void fetchJson<{ content?: { generated?: number; remaining?: number } }>(
        path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mergeMetadataSnapshotBody({ jobId, limit: totalUnits })),
        },
        "Generate Planned Draft worker",
      )
        .then((result) => {
          setOutput(formatResultMessage(path, result));
          router.refresh();
          setQueue((current) => ({
            ...current,
            currentUnit: "Complete",
            completedUnits: current.totalUnits,
            successfulUnits: current.totalUnits,
            elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
            currentCallElapsedSeconds: estimatedSecondsPerCall,
            currentCallProgress: 1,
            nextCallSeconds: 0,
            estimatedSecondsRemaining: 0,
            estimatedProgress: false,
            status: "complete",
          }));
        })
        .catch((error) => {
          setOutput(JSON.stringify({ error: error instanceof Error ? error.message : "Planned draft generation failed." }, null, 2));
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
        })
        .finally(() => {
          setLoading(null);
        });
    } catch (error) {
      setOutput(
        JSON.stringify(
          {
            error: describeTaskError(error, "Planned draft queue failed."),
          },
          null,
          2,
        ),
      );
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
      setLoading(null);
    }
  }

  async function runQueuedChapterSummaries(preflight: AiTaskPreflightData | null) {
    const path = `/api/books/${bookId}/chapters/summarize`;
    const totalUnits = Math.max(1, preflight?.expectedAiCalls || chapterCount || 1);
    const estimatedSecondsPerCall = preflight?.estimatedSecondsPerCall || 30;
    const startedAt = Date.now();

    setLoading(path);
    setOutput("");
    setQueue({
      currentTask: "Generate Chapter Summaries",
      currentUnit: `Queued ${totalUnits} chapter summary call(s)`,
      totalUnits,
      completedUnits: 0,
      successfulUnits: 0,
      failedUnits: 0,
      skippedUnits: 0,
      startedAt,
      estimatedSecondsPerCall,
      elapsedSeconds: 0,
      currentCallElapsedSeconds: 0,
      currentCallProgress: 0.1,
      nextCallSeconds: estimatedSecondsPerCall,
      estimatedSecondsRemaining: totalUnits * estimatedSecondsPerCall,
      estimatedProgress: true,
      status: "running",
    });

    try {
      const created = await fetchJson<{ content?: { jobId?: string; queued?: boolean; totalUnits?: number } }>(
        path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mergeMetadataSnapshotBody({ serverManaged: true })),
        },
        "Queue chapter summary generation",
      );

      const jobId = created.content?.jobId;
      if (!jobId) {
        throw new Error("Chapter summary job was not created.");
      }

      setOutput(`Chapter summaries queued for ${totalUnits} chapter(s).`);
      setQueue((current) => ({
        ...current,
        currentUnit: `Processing ${totalUnits} chapter summary call(s)`,
        status: "running",
        estimatedProgress: true,
      }));

      void fetchJson<{ content?: { summarized?: number; aiCallPlan?: Record<string, unknown> } }>(
        path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mergeMetadataSnapshotBody({ jobId })),
        },
        "Generate chapter summaries worker",
      )
        .then((result) => {
          setOutput(formatResultMessage(path, result));
          router.refresh();
          setQueue((current) => ({
            ...current,
            currentUnit: "Complete",
            completedUnits: current.totalUnits,
            successfulUnits: current.totalUnits,
            elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
            currentCallElapsedSeconds: estimatedSecondsPerCall,
            currentCallProgress: 1,
            nextCallSeconds: 0,
            estimatedSecondsRemaining: 0,
            estimatedProgress: false,
            status: "complete",
          }));
        })
        .catch((error) => {
          setOutput(JSON.stringify({ error: error instanceof Error ? error.message : "Chapter summary generation failed." }, null, 2));
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
        })
        .finally(() => {
          setLoading(null);
        });
    } catch (error) {
      setOutput(JSON.stringify({ error: error instanceof Error ? error.message : "Chapter summary queue failed." }, null, 2));
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
      setLoading(null);
    }
  }

  async function runQueuedBlueprint(preflight: AiTaskPreflightData | null) {
    const path = `/api/books/${bookId}/analyze`;
    const totalUnits = Math.max(1, preflight?.expectedAiCalls || chapterCount || 1);
    const estimatedSecondsPerCall = preflight?.estimatedSecondsPerCall || 45;
    const startedAt = Date.now();

    setLoading(path);
    setOutput("");
    setQueue({
      currentTask: "Generate Manuscript Blueprint",
      currentUnit: `Queued ${totalUnits} blueprint chunk(s)`,
      totalUnits,
      completedUnits: 0,
      successfulUnits: 0,
      failedUnits: 0,
      skippedUnits: 0,
      startedAt,
      estimatedSecondsPerCall,
      elapsedSeconds: 0,
      currentCallElapsedSeconds: 0,
      currentCallProgress: 0.1,
      nextCallSeconds: estimatedSecondsPerCall,
      estimatedSecondsRemaining: totalUnits * estimatedSecondsPerCall,
      estimatedProgress: true,
      status: "running",
    });

    try {
      const created = await fetchJson<{ content?: { jobId?: string; queued?: boolean; totalUnits?: number } }>(
        path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mergeMetadataSnapshotBody({ serverManaged: true })),
        },
        "Queue manuscript blueprint generation",
      );

      const jobId = created.content?.jobId;
      if (!jobId) {
        throw new Error("Blueprint job was not created.");
      }

      setOutput(`Manuscript Blueprint queued for ${totalUnits} chunk(s).`);
      setQueue((current) => ({
        ...current,
        currentUnit: `Processing ${totalUnits} blueprint chunk(s)`,
        status: "running",
        estimatedProgress: true,
      }));

      void fetchJson<{ content?: Record<string, unknown> }>(
        path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mergeMetadataSnapshotBody({ jobId })),
        },
        "Generate manuscript blueprint worker",
      )
        .then((result) => {
          setOutput(formatResultMessage(path, result));
          router.refresh();
          setQueue((current) => ({
            ...current,
            currentUnit: "Complete",
            completedUnits: current.totalUnits,
            successfulUnits: current.totalUnits,
            elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
            currentCallElapsedSeconds: estimatedSecondsPerCall,
            currentCallProgress: 1,
            nextCallSeconds: 0,
            estimatedSecondsRemaining: 0,
            estimatedProgress: false,
            status: "complete",
          }));
        })
        .catch((error) => {
          setOutput(JSON.stringify({ error: error instanceof Error ? error.message : "Manuscript Blueprint generation failed." }, null, 2));
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
        })
        .finally(() => {
          setLoading(null);
        });
    } catch (error) {
      setOutput(JSON.stringify({ error: error instanceof Error ? error.message : "Blueprint queue failed." }, null, 2));
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
      setLoading(null);
    }
  }

  async function runQueuedCriticAll(preflight: AiTaskPreflightData | null, body: unknown) {
    const path = `/api/books/${bookId}/critic/all`;
    const payload = (body && typeof body === "object" ? (body as { stage?: string }) : {}) || {};
    const stage = payload.stage === "post_rewrite" ? "post_rewrite" : "baseline";
    const totalUnits = 7;
    const estimatedSecondsPerCall = preflight?.estimatedSecondsPerCall || 35;
    const startedAt = Date.now();

    setLoading(path);
    setOutput("");
    setQueue({
      currentTask: "Run all BookForge Critic lenses",
      currentUnit: `Queued ${totalUnits} Critic lens call(s)`,
      totalUnits,
      completedUnits: 0,
      successfulUnits: 0,
      failedUnits: 0,
      skippedUnits: 0,
      startedAt,
      estimatedSecondsPerCall,
      elapsedSeconds: 0,
      currentCallElapsedSeconds: 0,
      currentCallProgress: 0.1,
      nextCallSeconds: estimatedSecondsPerCall,
      estimatedSecondsRemaining: totalUnits * estimatedSecondsPerCall,
      estimatedProgress: true,
      status: "running",
    });

    try {
      const created = await fetchJson<{ content?: { jobId?: string; queued?: boolean; totalUnits?: number } }>(
        path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mergeMetadataSnapshotBody({ stage, serverManaged: true })),
        },
        "Queue critic batch generation",
      );

      const jobId = created.content?.jobId;
      if (!jobId) {
        throw new Error("Critic batch job was not created.");
      }

      setOutput(`Critic batch queued (${stage === "post_rewrite" ? "post-rewrite" : "baseline"}).`);
      setQueue((current) => ({
        ...current,
        currentUnit: `Processing ${totalUnits} Critic lens call(s)`,
        status: "running",
        estimatedProgress: true,
      }));

      void fetchJson<{ content?: { completed?: number; results?: unknown[] } }>(
        path,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mergeMetadataSnapshotBody({ jobId, stage })),
        },
        "Run critic batch worker",
      )
        .then((result) => {
          setOutput(formatResultMessage(path, result));
          router.refresh();
          setQueue((current) => ({
            ...current,
            currentUnit: "Complete",
            completedUnits: current.totalUnits,
            successfulUnits: current.totalUnits,
            elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
            currentCallElapsedSeconds: estimatedSecondsPerCall,
            currentCallProgress: 1,
            nextCallSeconds: 0,
            estimatedSecondsRemaining: 0,
            estimatedProgress: false,
            status: "complete",
          }));
        })
        .catch((error) => {
          setOutput(JSON.stringify({ error: error instanceof Error ? error.message : "Critic batch failed." }, null, 2));
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
        })
        .finally(() => {
          setLoading(null);
        });
    } catch (error) {
      setOutput(JSON.stringify({ error: error instanceof Error ? error.message : "Critic batch queue failed." }, null, 2));
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
      setLoading(null);
    }
  }

  useEffect(() => {
    if (queue.status !== "running" || !queue.startedAt || !queue.estimatedSecondsPerCall || !queue.estimatedProgress) {
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
      {latestAutoReviewJob?.status === "completed" && (
        <Alert color="green" title="Auto-Review already completed for this manuscript">
          <Text size="sm" mb={6}>
            {`Last run: ${describeAutoReviewMode(latestAutoReviewJob.mode)} completed ${formatAutoReviewCompletionTime(
              latestAutoReviewJob.completed_at,
              latestAutoReviewJob.created_at,
            )}.`}
          </Text>
          <Text size="sm" c="dimmed">
            Review the revised manuscript and exports first. Prepare Context and Critic actions are still available, but they are usually redundant right after a completed Auto-Review.
          </Text>
        </Alert>
      )}

      {plannedChapterCount > 0 && (
        <Paper withBorder radius="md" p="lg" bg="#fff3e0">
          <Stack>
            <div>
              <Title order={3}>Write Your Chapters</Title>
              <Text size="sm" c="dimmed">
                Turn the planned chapter shells from your architecture into actual manuscript prose. Do this first — the tools below (critic, rewrite, export) all need drafted chapters to work with.
              </Text>
            </div>
            <Button
              fullWidth
              color="orange"
              loading={loading === "preflight:generate-draft" || loading === `/api/books/${bookId}/generate-draft`}
              onClick={() => openPreflight("generate-draft")}
            >
              Generate Planned Draft ({Math.min(plannedChapterCount, 3)} of {plannedChapterCount})
            </Button>
            <Text size="xs" c="dimmed">
              This opens AI Task Preflight. Click Proceed in that dialog to start chapter generation.
            </Text>
          </Stack>
        </Paper>
      )}

      <SimpleGrid cols={{ base: 1, lg: 3 }}>
        <ActionPanel
          title="Prepare Context"
          description="Build reusable manuscript context before revision."
        >
          <Button
            color="grape"
            fullWidth
            loading={loading === "preflight:book-bible" || loading === `/api/books/${bookId}/analyze`}
            onClick={() => requestTask("book-bible")}
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
            onClick={() => requestTask("chapter-summaries")}
          >
            Generate Chapter Summaries
          </Button>
          <Text size="xs" c="dimmed">
            This opens AI Task Preflight. Click Proceed in that dialog to start summary generation.
          </Text>
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
            onClick={() => requestTask("critic")}
          >
            Run Selected Critic Lens
          </Button>
          <Button
            fullWidth
            color="grape"
            loading={loading === "preflight:critic-all" || loading === `/api/books/${bookId}/critic/all`}
            onClick={() => requestTask("critic-all")}
          >
            Run All Critic Lenses
          </Button>
        </ActionPanel>

        <ActionPanel
          title="Rewrite & Export"
          description="Revise drafted chapters and build reviewable/final files."
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

      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">Queue visibility</Text>
        <Switch
          checked={alwaysShowDetailedQueue}
          onChange={(event) => setAlwaysShowDetailedQueue(event.currentTarget.checked)}
          label="Always show detailed queue"
          size="sm"
        />
      </Group>

      {(alwaysShowDetailedQueue || queue.status !== "idle" || queue.totalUnits > 0 || Boolean(queue.currentTask)) ? (
        <AiJobQueue
          job={queue}
          onPause={() => setQueue((current) => ({ ...current, status: "paused" }))}
          onResume={() => setQueue((current) => ({ ...current, status: "running" }))}
          onCancel={() => setQueue((current) => ({ ...current, status: "cancelled" }))}
          onRetryFailed={() => {
            if (queue.currentTask === "Generate Planned Draft") {
              void runQueuedGenerateDraft(null);
              return;
            }
            if (queue.currentTask === "Generate Chapter Summaries") {
              void runQueuedChapterSummaries(null);
              return;
            }
            if (queue.currentTask === "Generate Manuscript Blueprint") {
              void runQueuedBlueprint(null);
              return;
            }
            if (queue.currentTask === "Run all BookForge Critic lenses") {
              void runQueuedCriticAll(null, { stage: "baseline" });
              return;
            }

            setQueue((current) => ({
              ...current,
              failedUnits: 0,
              skippedUnits: 0,
              status: current.currentTask ? "running" : "idle",
            }));
          }}
        />
      ) : (
        <Alert color="gray" variant="light" title="AI Job Queue">
          No active local queue task.
        </Alert>
      )}
      {output && (
        <Alert color={output.startsWith("Error:") || output.includes('"error"') ? "red" : "green"} title="Latest result">
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
          if (task.kind === "auto-review") {
            void runAutoReview(task.preflight);
          } else if (task.path.endsWith("/analyze")) {
            void runQueuedBlueprint(task.preflight);
          } else if (task.path.includes("/critic/all")) {
            void runQueuedCriticAll(task.preflight, task.body);
          } else if (task.path.includes("/chapters/summarize")) {
            void runQueuedChapterSummaries(task.preflight);
          } else if (task.path.includes("/generate-draft")) {
            void runQueuedGenerateDraft(task.preflight);
          } else {
            void run(task.path, task.body || {}, task.preflight);
          }
        }}
      />
      <Modal
        opened={Boolean(pendingGuardTask)}
        onClose={() => setPendingGuardTask(null)}
        title="Auto-Review already completed"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            This manuscript already has a completed Auto-Review run. The selected action is still available, but it often duplicates work that was just completed.
          </Text>
          <Text size="sm" c="dimmed">
            Review the revised manuscript, critic outcomes, and exports first. Continue only if you intentionally want a fresh baseline/context pass.
          </Text>
          <Button
            color="grape"
            onClick={() => {
              if (!pendingGuardTask) return;
              const task = pendingGuardTask;
              setPendingGuardTask(null);
              void openPreflight(task);
            }}
          >
            Run anyway
          </Button>
          <Button variant="subtle" color="gray" onClick={() => setPendingGuardTask(null)}>
            Cancel
          </Button>
        </Stack>
      </Modal>
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

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function formatAutoReviewMessage(firstReview: AutoRevisionResponse | null, secondReview: AutoRevisionResponse | null) {
  const first: AutoReviewCounts | undefined = firstReview?.content?.applied || firstReview?.content?.decisions;
  const second: AutoReviewCounts | undefined = secondReview?.content?.applied || secondReview?.content?.decisions;
  const parts = [
    "Auto Review completed. Blueprint, summaries, baseline Critic, rewrite plan, paragraph rewrite, random revision decisions, and post-rewrite Critic were saved.",
  ];

  if (first) {
    parts.push(
      `First review: ${first.accepted ?? first.accept ?? 0} accepted, ${first.rejected ?? first.reject ?? 0} rejected, ${first.redo ?? 0} redo.`,
    );
  }
  if (second) {
    parts.push(
      `Redo review: ${second.accepted ?? second.accept ?? 0} accepted, ${second.rejected ?? second.reject ?? 0} rejected, ${second.redo ?? 0} redo.`,
    );
  }
  const nextStep = secondReview?.content?.nextStep || firstReview?.content?.nextStep;
  if (nextStep) parts.push(nextStep);

  return parts.join(" ");
}

function describeAutoReviewMode(mode: AutoReviewJobSummary["mode"]) {
  if (mode === "make_shorter") return "Make Shorter Auto-Review";
  if (mode === "make_longer") return "Make Longer Auto-Review";
  return "Full Auto-Review";
}

function formatAutoReviewCompletionTime(completedAt: string | null, createdAt: string) {
  const source = completedAt || createdAt;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleString();
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

  if (path.includes("/critic/all")) {
    const completed = result.content?.completed;
    return `BookForge Critic batch saved${typeof completed === "number" ? `: ${completed}/7 lenses completed.` : "."}`;
  }

  if (path.includes("/critic")) {
    return "BookForge Critic report saved.";
  }

  if (path.includes("/chapters/summarize")) {
    const summarized = result.content?.summarized;
    return `Chapter summaries saved.${typeof summarized === "number" ? ` Summarized ${summarized} chapter(s).` : ""}`;
  }

  if (path.includes("/generate-draft")) {
    const generated = result.content?.generated;
    const remaining = result.content?.remaining;
    return `Planned draft generated.${typeof generated === "number" ? ` Drafted ${generated} chapter(s).` : ""}${
      typeof remaining === "number" ? ` ${remaining} planned chapter(s) remaining.` : ""
    }`;
  }

  return "Task completed and saved.";
}

function describeTaskError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("<!DOCTYPE html")) {
    return `${fallback} The server returned an HTML error page instead of JSON. Check server logs for the underlying 500 error.`;
  }
  return message;
}
