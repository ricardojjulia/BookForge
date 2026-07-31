import { isLmStudioContextError } from "@/lib/lmstudio/runtime-limits";

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export type ModelCallOutcome = "success" | "empty_completion" | "underlength" | "context_error" | "error";

export type ModelCallTelemetry = { supabase: SupabaseClient; userId: string };

export type ModelTaskHealth = {
  successRate: number;
  sampleSize: number;
  recentIncidentSignatures: string[];
  maxSafeContext: number | null;
};

const NO_HEALTH: ModelTaskHealth = {
  successRate: 1,
  sampleSize: 0,
  recentIncidentSignatures: [],
  maxSafeContext: null,
};

/** Classifies an LM Studio call failure into a persisted outcome + short signature. */
export function classifyLmStudioError(error: unknown): { outcome: ModelCallOutcome; signature: string } {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : String(error || "");

  if (/RotatingKVCache|NotImplementedError/i.test(message)) {
    return { outcome: "context_error", signature: "rotating_kv_cache_nyi" };
  }
  if (isLmStudioContextError(error)) {
    return { outcome: "context_error", signature: "context_overflow" };
  }
  return { outcome: "error", signature: "unclassified" };
}

/** Validates plain long-form text (chapter prose, etc.) against a minimum word floor. */
export function validateLongFormOutput(text: string, input: { minimumWordFloor: number }) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const outcome: ModelCallOutcome = wordCount === 0 ? "empty_completion" : wordCount < input.minimumWordFloor ? "underlength" : "success";
  return { outcome, wordCount };
}

/** Fire-and-forget insert. Never throws — telemetry recording must not break a real generation call. */
export async function recordModelCallEvent(
  supabase: SupabaseClient,
  input: {
    userId: string;
    model: string;
    task: string;
    contextLength: number;
    outcome: ModelCallOutcome;
    errorSignature?: string | null;
    wordCount?: number | null;
    durationMs?: number | null;
  },
) {
  try {
    await supabase.from("model_call_events").insert({
      user_id: input.userId,
      model: input.model,
      task: input.task,
      context_length: input.contextLength,
      outcome: input.outcome,
      error_signature: input.errorSignature ?? null,
      word_count: input.wordCount ?? null,
      duration_ms: input.durationMs ?? null,
    });
  } catch {
    // Best-effort telemetry only.
  }
}

/**
 * Batched (single-query) empirical health lookup for a set of candidate models on
 * one task, over the last `sinceDays` days. Used both to adjust model scoring and
 * to cap load-time context requests for models with known context-related crashes.
 */
export async function getModelsTaskHealth(
  supabase: SupabaseClient,
  input: { userId: string; models: string[]; task: string; sinceDays?: number; recentIncidentWindow?: number },
): Promise<Map<string, ModelTaskHealth>> {
  const health = new Map<string, ModelTaskHealth>();
  if (input.models.length === 0) return health;

  const sinceDays = input.sinceDays ?? 14;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const recentIncidentWindow = input.recentIncidentWindow ?? 5;

  const { data, error } = await supabase
    .from("model_call_events")
    .select("model,outcome,error_signature,context_length,created_at")
    .eq("user_id", input.userId)
    .eq("task", input.task)
    .in("model", input.models)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(input.models.length * 50);

  if (error || !data) return health;

  const byModel = new Map<string, typeof data>();
  for (const row of data) {
    const rows = byModel.get(row.model) || [];
    rows.push(row);
    byModel.set(row.model, rows);
  }

  for (const [model, rows] of byModel) {
    const successCount = rows.filter((row) => row.outcome === "success").length;
    const maxSafeContext = rows
      .filter((row) => row.outcome === "success")
      .reduce<number | null>((max, row) => (max === null || row.context_length > max ? row.context_length : max), null);
    const recentIncidentSignatures = rows
      .slice(0, recentIncidentWindow)
      .filter((row) => row.outcome !== "success")
      .map((row) => row.error_signature || row.outcome);

    health.set(model, {
      successRate: rows.length > 0 ? successCount / rows.length : 1,
      sampleSize: rows.length,
      recentIncidentSignatures,
      maxSafeContext,
    });
  }

  return health;
}

export function getHealthFor(health: Map<string, ModelTaskHealth>, model: string): ModelTaskHealth {
  return health.get(model) || NO_HEALTH;
}

/** Empirical score adjustment for orchestrator.ts's additive scoring, bounded so it nudges rather than overrides. */
export function scoreHealthAdjustment(healthEntry: ModelTaskHealth): { points: number; reason: string | null } {
  if (healthEntry.sampleSize === 0) return { points: 0, reason: null };

  const hasRecentIncident = healthEntry.recentIncidentSignatures.length > 0;
  if (hasRecentIncident) {
    return { points: -35, reason: `recent ${healthEntry.recentIncidentSignatures[0]} incident on this task` };
  }

  const confidence = Math.min(healthEntry.sampleSize, 10) / 10;
  const points = Math.round(healthEntry.successRate * confidence * 15);
  return points > 0 ? { points, reason: `${Math.round(healthEntry.successRate * 100)}% empirical success on this task` } : { points: 0, reason: null };
}

/** Caps a proposed load-time context length using known-good/known-bad history for this model+task. */
export function capContextUsingHealth(targetContext: number, healthEntry: ModelTaskHealth): number {
  if (healthEntry.recentIncidentSignatures.length === 0) return targetContext;

  if (healthEntry.maxSafeContext) {
    return Math.min(targetContext, healthEntry.maxSafeContext);
  }

  // First-ever crash on record for this model+task with no known-good ceiling yet: step down once.
  return Math.max(8192, Math.floor(targetContext / 4));
}
