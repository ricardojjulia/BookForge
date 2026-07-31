import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";

const schema = z.object({
  jobId: z.string().uuid(),
  mode: z.enum(["full_review", "make_shorter", "make_longer"]),
  launchToken: z.string().uuid().optional(),
  launchOnly: z.boolean().optional(),
});

const CRITIC_LENSES = [
  "story_structure",
  "prose_quality",
  "continuity",
  "character_depth",
  "market_fit",
  "contemporary_view",
  "revision_priorities",
] as const;

const STRATEGY_BY_MODE: Record<"full_review" | "make_shorter" | "make_longer", { strategyId: string; strategySettings: Record<string, unknown> }> = {
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
const STAGE_MAX_ATTEMPTS = 3;

function isTransientStageError(error: unknown) {
  const message = getError(error);
  return /(fetch failed|Failed to fetch|ECONNRESET|ECONNREFUSED|ETIMEDOUT|HeadersTimeout|UND_ERR_|socket hang up|network error|timeout)/i.test(message);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AutoReviewJobRow = {
  id: string;
  status: string;
  current_stage: string;
  stages_completed: string[];
  iteration: number;
  config: Record<string, unknown> | null;
  log: Array<Record<string, unknown>> | null;
  error: string | null;
  export_id: string | null;
  created_at: string;
  completed_at: string | null;
};

type MetadataSelection = {
  metadataSnapshotId?: string | null;
  metadataBranchName?: string | null;
  metadataSelectionSource?: "explicit_snapshot" | "branch_active" | "active_snapshot" | null;
};

type AutoReviewLogEntry = Record<string, unknown> & {
  type?: string;
  launchToken?: string;
};

type AutoReviewJobUpdate = {
  stage?: string;
  iteration?: number;
  completed?: boolean;
  failed?: boolean;
  error?: string;
  exportId?: string | null;
  logEntry?: Record<string, unknown>;
};

function getError(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const candidate = e as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.error, candidate.details, candidate.hint]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
    if (parts.length > 0) {
      const suffix = typeof candidate.code === "string" && candidate.code.trim() ? ` (code: ${candidate.code.trim()})` : "";
      return `${parts.join(" | ")}${suffix}`;
    }
  }
  return "Failed.";
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  let parsedBody: z.infer<typeof schema> | null = null;
  let currentStage = "analyze";
  try {
    const { bookId } = await context.params;
    parsedBody = schema.parse(await request.json());
    const body = parsedBody;
    const cookie = request.headers.get("cookie") || "";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: job, error: jobError } = await supabase
      .from("auto_review_jobs")
      .select("id,status,current_stage,stages_completed,iteration,config,log,error,export_id,created_at,completed_at")
      .eq("id", body.jobId)
      .eq("book_id", bookId)
      .eq("user_id", user.id)
      .single();
    if (jobError) throw jobError;
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
    if (job.status === "completed") return NextResponse.json({ ok: true, message: "Job already completed." });
    if (job.status === "failed") return NextResponse.json({ ok: true, message: "Job already failed." });

    const baseUrl = new URL(request.url);
    const currentJob = job as AutoReviewJobRow;
    const selection = (currentJob.config || {}) as MetadataSelection;

    if (body.launchOnly) {
      return NextResponse.json({
        ok: true,
        accepted: true,
        launch: {
          jobId: currentJob.id,
          status: currentJob.status,
          currentStage: currentJob.current_stage || "analyze",
          iteration: currentJob.iteration || 0,
          completedStages: (currentJob.stages_completed || []).length,
          launchToken: body.launchToken || null,
        },
      });
    }

    if (body.launchToken) {
      const hasLaunch = (currentJob.log || []).some((entry) => {
        const parsed = entry as AutoReviewLogEntry;
        return parsed.type === "worker_launch" && parsed.launchToken === body.launchToken;
      });
      if (hasLaunch) {
        return NextResponse.json({
          ok: true,
          accepted: true,
          alreadyAccepted: true,
          launch: {
            jobId: currentJob.id,
            status: currentJob.status,
            currentStage: currentJob.current_stage || "analyze",
            iteration: currentJob.iteration || 0,
            completedStages: (currentJob.stages_completed || []).length,
            launchToken: body.launchToken,
          },
        });
      }
    }

    const updateJob = async (updates: AutoReviewJobUpdate) => {
      const { data: latest } = await supabase
        .from("auto_review_jobs")
        .select("id,stages_completed,log,iteration")
        .eq("id", body.jobId)
        .eq("book_id", bookId)
        .eq("user_id", user.id)
        .single();
      if (!latest) throw new Error("Auto-review job disappeared.");

      const stagesCompleted = updates.stage
        ? Array.from(new Set([...(latest.stages_completed || []), updates.stage]))
        : latest.stages_completed || [];
      const log = updates.logEntry
        ? [...(latest.log || []), { ...updates.logEntry, ts: new Date().toISOString() }]
        : latest.log || [];

      const payload: Record<string, unknown> = { stages_completed: stagesCompleted, log };
      if (updates.stage) payload.current_stage = updates.stage;
      if (updates.iteration !== undefined) payload.iteration = updates.iteration;
      if (updates.exportId !== undefined) payload.export_id = updates.exportId;
      if (updates.completed) {
        payload.status = "completed";
        payload.completed_at = new Date().toISOString();
      } else if (updates.failed) {
        payload.status = "failed";
        payload.error = updates.error || "Unknown error";
        payload.completed_at = new Date().toISOString();
      }

      const { error } = await supabase.from("auto_review_jobs").update(payload).eq("id", body.jobId);
      if (error) throw error;
    };

    if (body.launchToken) {
      await updateJob({
        logEntry: {
          type: "worker_launch",
          launchToken: body.launchToken,
          message: "Auto-review worker launch accepted.",
        },
      });
    }

    const callStage = async (path: string, payload?: unknown) => {
      const bodyPayload = payload as Record<string, unknown> | undefined;
      const isAutoRevisionPreview =
        path.includes("/auto-revision") &&
        !!bodyPayload &&
        bodyPayload.action === "preview";

      if (payload !== undefined && supportsServerManagedHandoff(path) && !isAutoRevisionPreview) {
        const queueRes = await fetch(new URL(path, baseUrl).toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            ...bodyPayload,
            serverManaged: true,
            metadataSnapshotId: selection.metadataSnapshotId || undefined,
            metadataBranchName: selection.metadataBranchName || undefined,
            metadataSelectionSource: selection.metadataSelectionSource || undefined,
          }),
        });
        const queueData = await queueRes.json().catch(() => ({}));
        if (!queueRes.ok || queueData.error) {
          throw new Error(String(queueData.error || `Stage queue failed: ${path}`));
        }
        const queuedContent = queueData.content as { jobId?: string; revisionJobId?: string } | undefined;
        const stageJobId = queuedContent?.jobId || queuedContent?.revisionJobId || (queueData.jobId as string | undefined);
        if (!stageJobId) {
          throw new Error(`Stage queue handoff missing job id: ${path}`);
        }

        const runRes = await fetch(new URL(path, baseUrl).toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            ...bodyPayload,
            jobId: stageJobId,
            metadataSnapshotId: selection.metadataSnapshotId || undefined,
            metadataBranchName: selection.metadataBranchName || undefined,
            metadataSelectionSource: selection.metadataSelectionSource || undefined,
          }),
        });
        const runData = await runRes.json().catch(() => ({}));
        if (!runRes.ok || runData.error) {
          throw new Error(String(runData.error || `Stage request failed: ${path}`));
        }
        return runData as Record<string, unknown>;
      }

      const res = await fetch(new URL(path, baseUrl).toString(), {
        method: payload !== undefined ? "POST" : "GET",
        headers: {
          "Content-Type": payload !== undefined ? "application/json" : undefined,
          cookie,
        } as Record<string, string>,
        body:
          payload !== undefined
            ? JSON.stringify({
                ...(payload as Record<string, unknown>),
                metadataSnapshotId: selection.metadataSnapshotId || undefined,
                metadataBranchName: selection.metadataBranchName || undefined,
                metadataSelectionSource: selection.metadataSelectionSource || undefined,
              })
            : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(String(data.error || `Stage request failed: ${path}`));
      }
      return data as Record<string, unknown>;
    };

    const supportsServerManagedHandoff = (path: string) =>
      path.includes("/analyze") ||
      path.includes("/chapters/summarize") ||
      path.includes("/critic") ||
      path.includes("/rewrite-plan") ||
      path.includes("/rewrite-execute") ||
      path.includes("/auto-revision") ||
      path.includes("/drift-check");

    const stageStatus = new Set(currentJob.stages_completed || []);
    const addStage = async (stage: string, message: string, extra?: Record<string, unknown>) => {
      await updateJob({
        stage,
        logEntry: { type: "stage_complete", stage, iteration: currentJob.iteration, message, ...(extra || {}) },
      });
    };

    const mode = body.mode;
    const strategy = STRATEGY_BY_MODE[mode];

    const runStageWithRetry = async <T>(stage: string, execute: () => Promise<T>): Promise<T> => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= STAGE_MAX_ATTEMPTS; attempt++) {
        try {
          return await execute();
        } catch (error) {
          lastError = error;
          const canRetry = isTransientStageError(error) && attempt < STAGE_MAX_ATTEMPTS;
          if (!canRetry) throw error;

          const delayMs = attempt * 2000;
          await updateJob({
            logEntry: {
              type: "info",
              iteration: currentIteration,
              message: `${stage} transient failure (${getError(error)}). Retrying ${attempt + 1}/${STAGE_MAX_ATTEMPTS} in ${Math.round(delayMs / 1000)}s.`,
            },
          });
          await wait(delayMs);
        }
      }
      throw lastError;
    };

    const stageOrder: string[] = [
      "analyze",
      "summarize",
      ...CRITIC_LENSES.map((lens) => `critic_baseline:${lens}`),
      "rewrite_plan",
      "rewrite_execute",
      "auto_accept",
      "drift_check",
      ...CRITIC_LENSES.map((lens) => `critic_post:${lens}`),
      "critics_check",
      "export",
      "mark_finished",
    ];

    if (currentJob.status !== "running") {
      await supabase.from("auto_review_jobs").update({ status: "running", current_stage: currentJob.current_stage || "analyze" }).eq("id", body.jobId);
    }

    let currentIteration = currentJob.iteration || 0;
    let exportId: string | null = currentJob.export_id;

    currentStage = currentJob.current_stage || "analyze";

    for (const stage of stageOrder) {
      if (stageStatus.has(stage)) continue;
      currentStage = stage;

      if (stage === "analyze") {
        await runStageWithRetry(stage, () => callStage(`/api/books/${bookId}/analyze`, {}));
        await addStage(stage, "Manuscript analysis completed.");
      } else if (stage === "summarize") {
        await runStageWithRetry(stage, () => callStage(`/api/books/${bookId}/chapters/summarize`, {}));
        await addStage(stage, "Chapter summaries completed.");
      } else if (stage.startsWith("critic_baseline:")) {
        const lens = stage.split(":")[1];
        await runStageWithRetry(stage, () => callStage(`/api/books/${bookId}/critic`, { lens, stage: "baseline" }));
        await addStage(stage, `Baseline critic ${lens} completed.`);
      } else if (stage === "rewrite_plan") {
        await runStageWithRetry(stage, () => callStage(`/api/books/${bookId}/rewrite-plan`, {}));
        await addStage(stage, "Rewrite plan generated.");
      } else if (stage === "rewrite_execute") {
        await runStageWithRetry(stage, () => callStage(`/api/books/${bookId}/rewrite-execute`, {
          maxUnits: 5000,
          strategyId: strategy.strategyId,
          strategySettings: strategy.strategySettings,
          distributeAcrossChapters: true,
        }));
        await addStage(stage, "Rewrite execution completed.");
      } else if (stage === "auto_accept") {
        await runStageWithRetry(stage, () => callStage(`/api/books/${bookId}/auto-revision`, {
          action: "run",
          trustProfile: "full_trust",
          maxDecisions: 5000,
        }));
        await addStage(stage, "Auto-accept completed.");
      } else if (stage === "drift_check") {
        await runStageWithRetry(stage, () => callStage(`/api/books/${bookId}/drift-check`, {}));
        await addStage(stage, "Drift check completed.");
      } else if (stage.startsWith("critic_post:")) {
        const lens = stage.split(":")[1];
        await runStageWithRetry(stage, () => callStage(`/api/books/${bookId}/critic`, { lens, stage: "post_rewrite" }));
        await addStage(stage, `Post-rewrite critic ${lens} completed.`);
      } else if (stage === "critics_check") {
        const result = await runStageWithRetry(stage, () => callStage(`/api/books/${bookId}/auto-review/critics-check`));
        const allGreen = Boolean(result.allGreen);
        const greenCount = Number(result.greenCount || 0);
        const total = Number(result.total || 0);
        const avgScore = result.avgScore as number | null | undefined;
        await addStage(stage, allGreen ? "Quality gate passed." : "Quality gate requested another loop.", {
          allGreen,
          greenCount,
          total,
          avgScore,
        });
        if (!allGreen && currentIteration < MAX_ITERATIONS - 1) {
          currentIteration += 1;
          await updateJob({
            iteration: currentIteration,
            logEntry: {
              type: "info",
              iteration: currentIteration,
              message: `Starting rewrite iteration ${currentIteration + 1}`,
            },
          });
          stageStatus.delete("rewrite_execute");
          stageStatus.delete("auto_accept");
          stageStatus.delete("drift_check");
          for (const lens of CRITIC_LENSES) {
            stageStatus.delete(`critic_post:${lens}`);
          }
          stageStatus.delete("critics_check");
          continue;
        }
      } else if (stage === "export") {
        const result = await runStageWithRetry(stage, () => callStage(`/api/books/${bookId}/export`, {
          format: "docx",
          sourceMode: "accepted",
          includeFrontMatter: true,
          includeBackMatter: true,
        }));
        exportId = (result.exportId as string | undefined) || (result.export as { id?: string } | undefined)?.id || exportId;
        await addStage(stage, "Export completed.", { exportId });
      } else if (stage === "mark_finished") {
        await runStageWithRetry(stage, () => callStage(`/api/books/${bookId}/mark-finished`, { exportId }));
        await addStage(stage, "Book marked finished.");
      }
    }

    await updateJob({
      completed: true,
      exportId,
      logEntry: {
        type: "info",
        iteration: currentIteration,
        message: "Auto-review worker completed.",
      },
    });

    return NextResponse.json({ ok: true, jobId: body.jobId, exportId });
  } catch (error) {
    console.error("Auto-review worker failed", error);
    const normalizedError = getLmStudioErrorMessage(error, getError(error), { task: currentStage });
    const resumableError = `${normalizedError} Resume from Auto-Review Wizard and completed stages will be skipped.`;
    try {
      const { bookId } = await context.params;
      if (parsedBody?.jobId) {
        const supabase = await createClient();
        await supabase
          .from("auto_review_jobs")
          .update({ status: "failed", current_stage: currentStage, error: resumableError, completed_at: new Date().toISOString() })
          .eq("id", parsedBody.jobId)
          .eq("book_id", bookId);
      }
    } catch {
      // best effort
    }
    return NextResponse.json({ error: resumableError }, { status: 500 });
  }
}
