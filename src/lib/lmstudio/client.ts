import OpenAI from "openai";
import type { LmStudioSettings } from "@/lib/types";
import {
  getLmStudioContextErrorMessage,
  getLmStudioRuntimeLimits,
  isLmStudioContextError,
  type LmStudioRuntimeLimits,
} from "@/lib/lmstudio/runtime-limits";
import {
  capContextUsingHealth,
  classifyLmStudioError,
  recordModelCallEvent,
  type ModelCallOutcome,
  type ModelCallTelemetry,
  type ModelTaskHealth,
} from "@/lib/ai/model-performance";

export const DEFAULT_LMSTUDIO_BASE_URL = "http://localhost:1234/v1";

export type NativeLmStudioModel = {
  key: string;
  display_name?: string;
  selected_variant?: string;
  loaded_instances?: Array<{ id: string; config?: { context_length?: number } }>;
  max_context_length?: number;
};

export type LmStudioTaskKind = "planning" | "rewrite" | "critic" | "extraction";

export type PreparedLmStudioModel = {
  model: string;
  runtimeLimits: LmStudioRuntimeLimits;
  loadedContextTokens: number | null;
  warnings: string[];
  nativeModelManagementAvailable: boolean;
  /** True when this shim represents a cloud provider (Anthropic, OpenAI, Google). */
  isCloud?: boolean;
};

/**
 * Kept separate from PreparedLmStudioModel (never embed a live Supabase client on
 * that type) because several routes persist the whole prepared model wholesale
 * into a jsonb column (job settings) — embedding a client reference there would
 * make it non-serializable.
 */
export type ModelCallTelemetryContext = ModelCallTelemetry & { task: string; model: string };

export function createLmStudioClient(settings?: Partial<LmStudioSettings>) {
  return new OpenAI({
    baseURL: settings?.baseUrl || process.env.LMSTUDIO_BASE_URL || DEFAULT_LMSTUDIO_BASE_URL,
    apiKey: settings?.apiKey || process.env.LMSTUDIO_API_KEY || "lm-studio",
  });
}

export async function testLmStudioConnection(settings?: Partial<LmStudioSettings>) {
  const client = createLmStudioClient(settings);
  const models = await client.models.list();
  return {
    ok: true,
    models: models.data.map((model) => model.id),
  };
}

export async function listNativeLmStudioModels(settings?: Partial<LmStudioSettings>) {
  const response = await fetch(`${getLmStudioServerRoot(settings?.baseUrl)}/api/v1/models`, {
    headers: getNativeApiHeaders(settings),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`LM Studio native model list failed with HTTP ${response.status}.`);
  const result = (await response.json()) as { models?: NativeLmStudioModel[] };
  return result.models || [];
}

export async function prepareLmStudioModelForTask(input: {
  settings: LmStudioSettings;
  model: string;
  task: LmStudioTaskKind;
  allowModelLoad?: boolean;
  /** Empirical health for this exact model+task, used to cap load-time context after known crashes. */
  modelHealth?: ModelTaskHealth;
}): Promise<PreparedLmStudioModel> {
  const runtimeLimits = getLmStudioRuntimeLimits(input.settings, input.task);
  const warnings = [...runtimeLimits.warnings];
  const model = input.model;

  if (!model) {
    return {
      model,
      runtimeLimits,
      loadedContextTokens: null,
      warnings: [...warnings, "No LM Studio model was selected for this task."],
      nativeModelManagementAvailable: false,
    };
  }

  let nativeModels: NativeLmStudioModel[] = [];
  try {
    nativeModels = await listNativeLmStudioModels(input.settings);
  } catch {
    return {
      model,
      runtimeLimits,
      loadedContextTokens: null,
      warnings: [
        ...warnings,
        "LM Studio native model-management API was unavailable. BookForge will use the OpenAI-compatible model list and conservative prompt budgets.",
      ],
      nativeModelManagementAvailable: false,
    };
  }

  const nativeModel = findNativeModel(nativeModels, model);
  if (!nativeModel) {
    const loadedFallback = findAnyLoadedNativeModel(nativeModels);
    if (input.allowModelLoad && loadedFallback) {
      return preparedLoadedFallback({
        requestedModel: model,
        task: input.task,
        settings: input.settings,
        runtimeLimits,
        warnings,
        fallback: loadedFallback,
        reason: `LM Studio native API did not find model ${model}.`,
      });
    }

    return {
      model,
      runtimeLimits,
      loadedContextTokens: null,
      warnings: [...warnings, `LM Studio native API did not find model ${model}.`],
      nativeModelManagementAvailable: true,
    };
  }

  const instance = findLoadedInstance(nativeModel, model);
  const loadedContext = instance?.config?.context_length || null;
  const uncappedTargetContext = Math.min(
    input.settings.contextWindowTokens,
    nativeModel.max_context_length || input.settings.contextWindowTokens,
  );
  const targetContext = input.modelHealth ? capContextUsingHealth(uncappedTargetContext, input.modelHealth) : uncappedTargetContext;
  const targetWarnings =
    targetContext < runtimeLimits.configuredContextTokens
      ? [
          ...warnings,
          targetContext < uncappedTargetContext
            ? `${model} previously crashed at a larger loaded context on this task, so BookForge requested a reduced ${targetContext.toLocaleString()} token context this time.`
            : `${model} supports up to ${targetContext.toLocaleString()} context tokens in LM Studio, below the configured ${runtimeLimits.configuredContextTokens.toLocaleString()} token target.`,
        ]
      : warnings;

  // A model already loaded at a large context isn't automatically "good enough" —
  // if history shows this model+task crashes/empties at its currently loaded size,
  // don't trust it; fall through so it gets reloaded at the capped context instead.
  const loadedContextIsKnownUnsafe =
    Boolean(input.modelHealth?.recentIncidentSignatures.length) &&
    Boolean(loadedContext) &&
    loadedContext! > targetContext;

  if (instance && loadedContext && loadedContext >= targetContext && !loadedContextIsKnownUnsafe) {
    return {
      model: instance.id || model,
      runtimeLimits: getLmStudioRuntimeLimits({ ...input.settings, contextWindowTokens: loadedContext }, input.task),
      loadedContextTokens: loadedContext,
      warnings: targetWarnings,
      nativeModelManagementAvailable: true,
    };
  }

  if (!input.allowModelLoad) {
    return {
      model,
      runtimeLimits: loadedContext
        ? getLmStudioRuntimeLimits({ ...input.settings, contextWindowTokens: loadedContext }, input.task)
        : runtimeLimits,
      loadedContextTokens: loadedContext,
      warnings: [
        ...targetWarnings,
        loadedContext
          ? `${model} is loaded with ${loadedContext.toLocaleString()} context tokens, below the target ${targetContext.toLocaleString()} token context.`
          : `${model} is not loaded in LM Studio.`,
      ],
      nativeModelManagementAvailable: true,
    };
  }

  let loadResult: Awaited<ReturnType<typeof loadNativeLmStudioModel>>;
  try {
    loadResult = await loadNativeLmStudioModel(input.settings, {
      model: nativeModel.selected_variant || nativeModel.key || model,
      contextLength: targetContext,
    });
  } catch (error) {
    if (instance && loadedContext) {
      return {
        model: instance.id || model,
        runtimeLimits: getLmStudioRuntimeLimits({ ...input.settings, contextWindowTokens: loadedContext }, input.task),
        loadedContextTokens: loadedContext,
        warnings: [
          ...targetWarnings,
          `LM Studio could not reload ${model}; BookForge will use the already loaded ${loadedContext.toLocaleString()} token instance. ${getErrorText(error)}`,
        ],
        nativeModelManagementAvailable: true,
      };
    }
    const loadedFallback = findAnyLoadedNativeModel(nativeModels);
    if (loadedFallback) {
      return preparedLoadedFallback({
        requestedModel: model,
        task: input.task,
        settings: input.settings,
        runtimeLimits,
        warnings: targetWarnings,
        fallback: loadedFallback,
        reason: getErrorText(error),
      });
    }
    throw error;
  }
  const loadedContextTokens = loadResult.contextLength || targetContext;

  if (instance?.id && loadResult.instanceId && loadResult.instanceId !== instance.id) {
    await unloadNativeLmStudioModel(input.settings, instance.id);
  }

  return {
    model: loadResult.instanceId || model,
    runtimeLimits: getLmStudioRuntimeLimits({ ...input.settings, contextWindowTokens: loadedContextTokens }, input.task),
    loadedContextTokens,
    warnings: [
      ...targetWarnings,
      `${model} was ${instance ? "reloaded" : "loaded"} in LM Studio with ${loadedContextTokens.toLocaleString()} context tokens for this ${input.task} task.`,
    ],
    nativeModelManagementAvailable: true,
  };
}

export async function createManagedChatCompletion(
  client: OpenAI,
  prepared: PreparedLmStudioModel,
  params: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model" | "max_tokens"> & {
    model?: string;
    max_tokens?: number;
  },
  validateOutcome?: (content: string) => { outcome: ModelCallOutcome; wordCount?: number },
  telemetryContext?: ModelCallTelemetryContext,
) {
  const startedAt = Date.now();
  try {
    const paramsWithoutTopP = Object.fromEntries(
      Object.entries(params).filter(([key]) => key !== "top_p"),
    ) as typeof params;
    const safeParams = prepared.isCloud ? paramsWithoutTopP : params;
    const completion = await client.chat.completions.create({
      ...safeParams,
      model: params.model || prepared.model,
      max_tokens: Math.min(params.max_tokens || prepared.runtimeLimits.maxOutputTokens, prepared.runtimeLimits.maxOutputTokens),
    });
    recordCompletionOutcome(prepared, completion, validateOutcome, telemetryContext, Date.now() - startedAt);
    return completion;
  } catch (error) {
    if (isDeprecatedTemperatureError(error) && "temperature" in params) {
      const paramsWithoutTemperature = Object.fromEntries(
        Object.entries(params).filter(([key]) => key !== "temperature"),
      ) as typeof params;
      const paramsWithoutTopP = Object.fromEntries(
        Object.entries(paramsWithoutTemperature).filter(([key]) => key !== "top_p"),
      ) as typeof paramsWithoutTemperature;
      const safeRetryParams = prepared.isCloud ? paramsWithoutTopP : paramsWithoutTemperature;

      const completion = await client.chat.completions.create({
        ...safeRetryParams,
        model: params.model || prepared.model,
        max_tokens: Math.min(
          params.max_tokens || prepared.runtimeLimits.maxOutputTokens,
          prepared.runtimeLimits.maxOutputTokens,
        ),
      });
      recordCompletionOutcome(prepared, completion, validateOutcome, telemetryContext, Date.now() - startedAt);
      return completion;
    }

    if (telemetryContext) {
      const { outcome, signature } = classifyLmStudioError(error);
      void recordModelCallEvent(telemetryContext.supabase, {
        userId: telemetryContext.userId,
        model: telemetryContext.model,
        task: telemetryContext.task,
        contextLength: prepared.runtimeLimits.configuredContextTokens,
        outcome,
        errorSignature: signature,
        durationMs: Date.now() - startedAt,
      });
    }

    if (isLmStudioContextError(error)) {
      throw new Error(getLmStudioContextErrorMessage(error, prepared.runtimeLimits));
    }
    throw error;
  }
}

/**
 * Baseline output-length validation applied to every call that doesn't supply its
 * own task-specific validator. Deliberately loose (it must not misclassify a
 * legitimate short JSON payload like `{"score":82}`) — it only catches truly
 * degenerate responses (empty, or a handful of stray characters/tokens).
 */
function defaultValidateOutcome(content: string): { outcome: ModelCallOutcome; wordCount: number } {
  const trimmed = content.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  if (!trimmed) return { outcome: "empty_completion", wordCount: 0 };
  if (trimmed.length < 20) return { outcome: "underlength", wordCount };
  return { outcome: "success", wordCount };
}

function recordCompletionOutcome(
  prepared: PreparedLmStudioModel,
  completion: OpenAI.Chat.Completions.ChatCompletion,
  validateOutcome: ((content: string) => { outcome: ModelCallOutcome; wordCount?: number }) | undefined,
  telemetryContext: ModelCallTelemetryContext | undefined,
  durationMs: number,
) {
  if (!telemetryContext) return;
  const content = completion.choices[0]?.message.content || "";
  const result = validateOutcome ? validateOutcome(content) : defaultValidateOutcome(content);
  void recordModelCallEvent(telemetryContext.supabase, {
    userId: telemetryContext.userId,
    model: telemetryContext.model,
    task: telemetryContext.task,
    contextLength: prepared.runtimeLimits.configuredContextTokens,
    outcome: result.outcome,
    wordCount: result.wordCount ?? null,
    durationMs,
  });
}

function isDeprecatedTemperatureError(error: unknown): boolean {
  const message = getErrorText(error).toLowerCase();
  return message.includes("temperature") && message.includes("deprecated");
}

async function loadNativeLmStudioModel(
  settings: Partial<LmStudioSettings>,
  input: { model: string; contextLength: number },
) {
  const response = await fetch(`${getLmStudioServerRoot(settings.baseUrl)}/api/v1/models/load`, {
    method: "POST",
    headers: { ...getNativeApiHeaders(settings), "content-type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      context_length: input.contextLength,
      flash_attention: true,
      echo_load_config: true,
    }),
  });
  if (!response.ok) throw new Error(`LM Studio model load failed with HTTP ${response.status}.${await formatLmStudioErrorBody(response)}`);
  const result = (await response.json()) as {
    instance_id?: string;
    load_config?: { context_length?: number };
  };
  return {
    instanceId: result.instance_id,
    contextLength: result.load_config?.context_length,
  };
}

export async function unloadNativeLmStudioModel(settings: Partial<LmStudioSettings>, instanceId: string) {
  const response = await fetch(`${getLmStudioServerRoot(settings.baseUrl)}/api/v1/models/unload`, {
    method: "POST",
    headers: { ...getNativeApiHeaders(settings), "content-type": "application/json" },
    body: JSON.stringify({ instance_id: instanceId }),
  });
  if (!response.ok) throw new Error(`LM Studio model unload failed with HTTP ${response.status}.${await formatLmStudioErrorBody(response)}`);
}

async function formatLmStudioErrorBody(response: Response) {
  const body = await response.text().catch(() => "");
  return body ? ` ${body.slice(0, 500)}` : "";
}

function getErrorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function preparedLoadedFallback(input: {
  requestedModel: string;
  task: LmStudioTaskKind;
  settings: LmStudioSettings;
  runtimeLimits: LmStudioRuntimeLimits;
  warnings: string[];
  fallback: { model: NativeLmStudioModel; instance: NonNullable<NativeLmStudioModel["loaded_instances"]>[number] };
  reason: string;
}): PreparedLmStudioModel {
  const loadedContext = input.fallback.instance.config?.context_length || input.runtimeLimits.configuredContextTokens;
  return {
    model: input.fallback.instance.id,
    runtimeLimits: getLmStudioRuntimeLimits({ ...input.settings, contextWindowTokens: loadedContext }, input.task),
    loadedContextTokens: loadedContext,
    warnings: [
      ...input.warnings,
      `LM Studio could not prepare ${input.requestedModel}; BookForge will use already loaded model ${input.fallback.instance.id}. ${input.reason}`,
    ],
    nativeModelManagementAvailable: true,
  };
}

function getLmStudioServerRoot(baseUrl?: string) {
  const url = new URL(baseUrl || process.env.LMSTUDIO_BASE_URL || DEFAULT_LMSTUDIO_BASE_URL);
  url.pathname = url.pathname.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function getNativeApiHeaders(settings?: Partial<LmStudioSettings>): Record<string, string> {
  return settings?.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {};
}

function findNativeModel(models: NativeLmStudioModel[], model: string) {
  return models.find((item) =>
    [item.key, item.display_name, item.selected_variant].filter(Boolean).some((value) => value === model),
  );
}

function findLoadedInstance(model: NativeLmStudioModel, requestedModel: string) {
  return model.loaded_instances?.find((instance) => instance.id === requestedModel) || model.loaded_instances?.[0] || null;
}

function findAnyLoadedNativeModel(models: NativeLmStudioModel[]) {
  for (const model of models) {
    const instance = model.loaded_instances?.[0];
    if (instance) return { model, instance };
  }
  return null;
}
