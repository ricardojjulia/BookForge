import { createAdminClient } from "@/lib/supabase/admin";
import { extractJobProgress } from "@/lib/ai/job-state";

export type HistoricalEstimate = {
  secondsPerUnit: number;
  sampleSize: number;
};

const MIN_SAMPLE_SIZE = 3;
const MAX_ROWS_CONSIDERED = 40;

// The static call-planner formula (src/lib/ai/call-planner.ts) only models
// local LM Studio token throughput by model size/quantization -- it has no
// concept of a cloud provider's latency, so estimates for OpenRouter/etc.
// accounts have been off by 10-1000x in practice (confirmed live: a real
// manuscript_blueprint job estimated 43 minutes and took 20 seconds; a
// rewrite_plan job estimated 35 seconds and took nearly 6 hours). Every
// completed job already gets its real duration logged
// (logJobCompletionSummaries -> model_call_events, event_type
// "job_completed_summary") -- this reads that real history back out, pooled
// across ALL users for a given task so a brand-new user's very first run
// benefits from everyone else's completed runs instead of cold-starting on
// the same broken static formula. duration_ms alone isn't comparable across
// jobs of different sizes (a 3-chapter batch vs a 15-chapter one), so this
// normalizes to seconds-per-unit using each job's real totalUnits.
export async function getHistoricalSecondsPerUnit(task: string): Promise<HistoricalEstimate | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("model_call_events")
    .select("duration_ms, job_id, revision_jobs(settings)")
    .eq("event_type", "job_completed_summary")
    .eq("task", task)
    .eq("outcome", "success")
    .not("duration_ms", "is", null)
    .not("job_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS_CONSIDERED);

  if (error || !data?.length) return null;

  const secondsPerUnitSamples: number[] = [];
  for (const row of data) {
    const durationMs = row.duration_ms as number | null;
    const jobSettings = (row as { revision_jobs?: { settings?: unknown } | null }).revision_jobs?.settings;
    const totalUnits = extractJobProgress(jobSettings)?.totalUnits || 0;
    if (!durationMs || !totalUnits) continue;
    const secondsPerUnit = durationMs / 1000 / totalUnits;
    if (Number.isFinite(secondsPerUnit) && secondsPerUnit > 0) {
      secondsPerUnitSamples.push(secondsPerUnit);
    }
  }

  if (secondsPerUnitSamples.length < MIN_SAMPLE_SIZE) return null;

  secondsPerUnitSamples.sort((a, b) => a - b);
  const mid = Math.floor(secondsPerUnitSamples.length / 2);
  const median =
    secondsPerUnitSamples.length % 2 === 0
      ? (secondsPerUnitSamples[mid - 1] + secondsPerUnitSamples[mid]) / 2
      : secondsPerUnitSamples[mid];

  return {
    secondsPerUnit: Math.max(1, Math.round(median)),
    sampleSize: secondsPerUnitSamples.length,
  };
}
