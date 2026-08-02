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

export type RevisionJobHeartbeat = {
  touch: (progress?: Partial<AiJobProgress>) => Promise<void>;
  stop: () => void;
};

export function createRevisionJobHeartbeat(
  supabase: SupabaseClient,
  jobId: string,
  settings: unknown,
  progress: Partial<AiJobProgress>,
  intervalMs = 30000,
): RevisionJobHeartbeat {
  let latestSettings = settings;
  let latestProgress = buildJobProgress(progress);
  let stopped = false;

  const touch = async (progressPatch: Partial<AiJobProgress> = {}) => {
    if (stopped) return;
    latestProgress = buildJobProgress({
      ...extractJobProgress(latestSettings),
      ...latestProgress,
      ...progressPatch,
      lastHeartbeatAt: new Date().toISOString(),
    });
    latestSettings = mergeJobSettings(latestSettings, latestProgress);
    const { error } = await supabase.from("revision_jobs").update({ settings: latestSettings }).eq("id", jobId);
    if (error) throw error;
  };

  const interval = setInterval(() => {
    void touch();
  }, intervalMs);
  if (typeof interval.unref === "function") interval.unref();

  return {
    touch,
    stop: () => {
      stopped = true;
      clearInterval(interval);
    },
  };
}

export type RevisionJobVisibilitySummary = {
  total: number;
  active: number;
  running: number;
  queued: number;
  paused: number;
  completed: number;
  failed: number;
  cancelled: number;
  staleRunning: number;
};

export function summarizeRevisionJobs(
  jobs: Array<{ status: string | null; settings: unknown }>,
): RevisionJobVisibilitySummary {
  const summary: RevisionJobVisibilitySummary = {
    total: 0,
    active: 0,
    running: 0,
    queued: 0,
    paused: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    staleRunning: 0,
  };

  for (const job of jobs) {
    summary.total += 1;
    const progress = extractJobProgress(job.settings);
    if (job.status === "running") {
      summary.running += 1;
      summary.active += 1;
      if (isStaleRunningJob(job.status, progress)) summary.staleRunning += 1;
    } else if (job.status === "queued") {
      summary.queued += 1;
      summary.active += 1;
    } else if (job.status === "paused") {
      summary.paused += 1;
      summary.active += 1;
    } else if (job.status === "completed") {
      summary.completed += 1;
    } else if (job.status === "failed") {
      summary.failed += 1;
    } else if (job.status === "cancelled") {
      summary.cancelled += 1;
    }
  }

  return summary;
}

type StaleHealJobRow = { id: string; mode: string; status: string | null; settings: unknown };

// A dead server-side request leaves a job stuck at status="running" forever
// -- its heartbeat just stops, with nothing to notice or act on it (the
// existing isStaleRunningJob check only labels this "possibly interrupted"
// for whoever happens to be looking at the Jobs History page). This sweep
// runs opportunistically whenever the jobs list is fetched (no cron
// infrastructure required) and auto-fails anything stale well past that
// display threshold, logging the incident for trust/reliability stats.
export async function detectAndHealStaleJobs(
  supabase: SupabaseClient,
  userId: string,
  jobs: StaleHealJobRow[],
  staleAfterSeconds = 600,
) {
  const healedJobIds: string[] = [];
  for (const job of jobs) {
    const progress = extractJobProgress(job.settings);
    if (!isStaleRunningJob(job.status, progress, staleAfterSeconds)) continue;

    const staleSinceMs = progress?.lastHeartbeatAt ? Date.now() - new Date(progress.lastHeartbeatAt).getTime() : null;
    const staleMinutes = staleSinceMs ? Math.round(staleSinceMs / 60000) : null;

    const { data: updated, error: updateError } = await supabase
      .from("revision_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: `Auto-detected as stalled: no heartbeat for over ${staleMinutes ?? "several"} minute(s). The server-side process likely died mid-run without reaching its own failure handler.`,
      })
      .eq("id", job.id)
      .eq("status", "running")
      .select("id");
    if (updateError || !updated?.length) continue;

    await supabase.from("model_call_events").insert({
      user_id: userId,
      job_id: job.id,
      model: "n/a",
      task: job.mode,
      context_length: 0,
      outcome: "error",
      error_signature: "job_stale_auto_detected",
      duration_ms: staleSinceMs,
      event_type: "job_stale_detected",
    });
    healedJobIds.push(job.id);
  }
  return healedJobIds;
}

type CompletionSummaryJobRow = {
  id: string;
  mode: string;
  status: string | null;
  settings: unknown;
  started_at: string | null;
  completed_at: string | null;
};

// Logs estimated-vs-actual duration once per terminal job, so estimation
// accuracy (the "estimatedSecondsPerUnit"/"estimatedTotalSeconds" shown in
// the AI Task Preflight modal) can eventually be measured and improved from
// real outcomes instead of the static formula it's computed from today.
export async function logJobCompletionSummaries(supabase: SupabaseClient, userId: string, jobs: CompletionSummaryJobRow[]) {
  const terminalJobs = jobs.filter((job) => job.status === "completed" || job.status === "failed");
  if (!terminalJobs.length) return;

  const { data: existing } = await supabase
    .from("model_call_events")
    .select("job_id")
    .eq("event_type", "job_completed_summary")
    .in(
      "job_id",
      terminalJobs.map((job) => job.id),
    );
  const alreadyLogged = new Set((existing || []).map((row) => row.job_id));

  const rowsToInsert = [];
  for (const job of terminalJobs) {
    if (alreadyLogged.has(job.id) || !job.started_at || !job.completed_at) continue;
    const progress = extractJobProgress(job.settings);
    const actualDurationMs = new Date(job.completed_at).getTime() - new Date(job.started_at).getTime();
    const estimatedDurationMs =
      progress?.estimatedSecondsPerUnit && progress.totalUnits
        ? progress.estimatedSecondsPerUnit * progress.totalUnits * 1000
        : null;
    rowsToInsert.push({
      user_id: userId,
      job_id: job.id,
      model: "n/a",
      task: job.mode,
      context_length: 0,
      outcome: job.status === "completed" ? "success" : "error",
      duration_ms: actualDurationMs,
      estimated_duration_ms: estimatedDurationMs,
      event_type: "job_completed_summary",
    });
  }
  if (rowsToInsert.length) {
    await supabase.from("model_call_events").insert(rowsToInsert);
  }
}

// A real rewrite pass is usually many small revision_jobs rows (the UI caps
// "Execute Rewrite" at ~25 paragraphs per click), so the single
// most-recently-*created* job of a given mode can easily be a trailing
// batch that found zero remaining eligible paragraphs -- a legitimate,
// expected outcome once coverage is complete, not an error. Anything that
// wants "the job that did the most recent real work" (e.g. drift-check
// sampling) should look at what actually produced output, not job-row
// recency, or it silently has nothing to work with even though real work
// just happened moments earlier.
export async function getLatestJobIdWithRevisions(supabase: SupabaseClient, bookId: string) {
  const { data, error } = await supabase
    .from("revision_versions")
    .select("revision_job_id")
    .eq("book_id", bookId)
    .not("revision_job_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.revision_job_id as string | undefined) || null;
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
