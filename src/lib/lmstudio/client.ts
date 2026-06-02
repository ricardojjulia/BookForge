import OpenAI from "openai";
import type { LmStudioSettings } from "@/lib/types";
import {
  getLmStudioContextErrorMessage,
  getLmStudioRuntimeLimits,
  isLmStudioContextError,
  type LmStudioRuntimeLimits,
} from "@/lib/lmstudio/runtime-limits";

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
  const targetContext = Math.min(
    input.settings.contextWindowTokens,
    nativeModel.max_context_length || input.settings.contextWindowTokens,
  );
  const targetWarnings =
    targetContext < runtimeLimits.configuredContextTokens
      ? [
          ...warnings,
          `${model} supports up to ${targetContext.toLocaleString()} context tokens in LM Studio, below the configured ${runtimeLimits.configuredContextTokens.toLocaleString()} token target.`,
        ]
      : warnings;

  if (instance && loadedContext && loadedContext >= targetContext) {
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
) {
  try {
    const paramsWithoutTopP = Object.fromEntries(
      Object.entries(params).filter(([key]) => key !== "top_p"),
    ) as typeof params;
    const safeParams = prepared.isCloud ? paramsWithoutTopP : params;
    return await client.chat.completions.create({
      ...safeParams,
      model: params.model || prepared.model,
      max_tokens: Math.min(params.max_tokens || prepared.runtimeLimits.maxOutputTokens, prepared.runtimeLimits.maxOutputTokens),
    });
  } catch (error) {
    if (isLmStudioContextError(error)) {
      throw new Error(getLmStudioContextErrorMessage(error, prepared.runtimeLimits));
    }
    throw error;
  }
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
