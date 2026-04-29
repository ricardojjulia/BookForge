import type { SupabaseClient } from "@supabase/supabase-js";

export type AiJobProgress = {
  taskName: string;
  currentUnit: string;
  totalUnits: number;
  attempted: number;
  successful: number;
  failed: number;
  skipped: number;
  startedAt?: string | null;
  completedAt?: string | null;
  estimatedSecondsPerUnit?: number | null;
  lastHeartbeatAt?: string | null;
  message?: string | null;
  failedUnits?: AiJobFailedUnit[];
};

export type AiJobFailedUnit = {
  id: string;
  label: string;
  type: "paragraph" | "chapter" | "critic_lens" | "analysis_chunk";
  error: string;
};

export function buildJobProgress(input: Partial<AiJobProgress>): AiJobProgress {
  return {
    taskName: input.taskName || "AI task",
    currentUnit: input.currentUnit || "Queued",
    totalUnits: Math.max(0, input.totalUnits || 0),
    attempted: Math.max(0, input.attempted || 0),
    successful: Math.max(0, input.successful || 0),
    failed: Math.max(0, input.failed || 0),
    skipped: Math.max(0, input.skipped || 0),
    startedAt: input.startedAt || null,
    completedAt: input.completedAt || null,
    estimatedSecondsPerUnit: input.estimatedSecondsPerUnit || null,
    lastHeartbeatAt: input.lastHeartbeatAt || null,
    message: input.message || null,
    failedUnits: Array.isArray(input.failedUnits) ? input.failedUnits : [],
  };
}

export function isStaleRunningJob(status: string | null, progress: AiJobProgress | null, staleAfterSeconds = 120) {
  if (status !== "running" || !progress?.lastHeartbeatAt) return false;
  return Date.now() - new Date(progress.lastHeartbeatAt).getTime() > staleAfterSeconds * 1000;
}

export function mergeJobSettings(settings: unknown, progress: AiJobProgress) {
  const base = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  return {
    ...base,
    progress,
  };
}

export function extractJobProgress(settings: unknown): AiJobProgress | null {
  if (!settings || typeof settings !== "object" || !("progress" in settings)) return null;
  const progress = (settings as { progress?: unknown }).progress;
  if (!progress || typeof progress !== "object") return null;
  const row = progress as Partial<AiJobProgress>;
  return buildJobProgress(row);
}

type JobProgressDisplayInput = Pick<AiJobProgress, "totalUnits" | "attempted" | "successful" | "failed">;

export function getJobProgressDisplay(progress: JobProgressDisplayInput | null, status?: string | null) {
  if (!progress) {
    return {
      completed: 0,
      total: 1,
      percent: 0,
    };
  }

  const processed = Math.max(progress.attempted, progress.successful + progress.failed);
  const total = Math.max(progress.totalUnits || processed || 0, 1);
  const completed = status === "completed" ? total : Math.min(total, processed);

  return {
    completed,
    total,
    percent: Math.min(100, Math.round((completed / total) * 100)),
  };
}

export async function updateRevisionJobProgress(
  supabase: SupabaseClient,
  jobId: string,
  settings: unknown,
  progress: Partial<AiJobProgress>,
) {
  const nextProgress = buildJobProgress({
    ...extractJobProgress(settings),
    ...progress,
    lastHeartbeatAt: new Date().toISOString(),
  });
  const nextSettings = mergeJobSettings(settings, nextProgress);
  const { error } = await supabase.from("revision_jobs").update({ settings: nextSettings }).eq("id", jobId);
  if (error) throw error;
  return nextSettings;
}

export async function getRevisionJobStatus(supabase: SupabaseClient, jobId: string) {
  const { data, error } = await supabase.from("revision_jobs").select("status").eq("id", jobId).single();
  if (error) throw error;
  return String(data.status || "");
}

export async function waitWhileRevisionJobPaused(supabase: SupabaseClient, jobId: string) {
  let status = await getRevisionJobStatus(supabase, jobId);
  while (status === "paused") {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    status = await getRevisionJobStatus(supabase, jobId);
  }
  return status;
}
