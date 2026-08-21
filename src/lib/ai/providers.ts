/**
 * Unified LLM provider client factory.
 *
 * Supports:
 *   - LM Studio   (OpenAI-compatible local server)
 *   - OpenAI      (gpt-5, gpt-5-mini, gpt-4.1, o4-mini, …)
 *   - Anthropic   (claude-opus-5, claude-sonnet-5, claude-haiku-4-5, …)
 *   - Google      (gemini-2.5-pro, gemini-2.5-flash, …)  via OpenAI-compatible endpoint
 *   - OpenRouter  (one API key, hundreds of backends)     via OpenAI-compatible endpoint
 *
 * All providers are normalised to a single `chatCompletion()` call that returns
 * an OpenAI-style `ChatCompletion` response so the rest of the codebase needs
 * no changes.
 *
 * Model IDs come from `@/lib/ai/model-catalog` — update the catalog, not this
 * file, when a provider ships a new model.
 */

import OpenAI from "openai";
import type { StandardLlmSettings, LlmProvider } from "@/lib/types";
import { getCloudModelsForProvider } from "@/lib/ai/model-catalog";

// ---------------------------------------------------------------------------
// Provider metadata
// ---------------------------------------------------------------------------

export type ProviderMeta = {
  id: LlmProvider;
  label: string;
  defaultModels: string[];
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
};

export const PROVIDER_META: ProviderMeta[] = [
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    defaultModels: [],
    requiresApiKey: false,
    defaultBaseUrl: "http://localhost:1234/v1",
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModels: getCloudModelsForProvider("openai").map((entry) => entry.id),
    requiresApiKey: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultModels: getCloudModelsForProvider("anthropic").map((entry) => entry.id),
    requiresApiKey: true,
  },
  {
    id: "google",
    label: "Google Gemini",
    defaultModels: getCloudModelsForProvider("google").map((entry) => entry.id),
    requiresApiKey: true,
    // Google exposes an OpenAI-compatible REST endpoint
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModels: getCloudModelsForProvider("openrouter").map((entry) => entry.id),
    requiresApiKey: true,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
  },
];

// LM Studio is a local server on the user's own machine -- unreachable from
// managed-SaaS's Vercel-hosted runtime (see CLOUD_PROVIDER_TIMEOUT_MS comment
// below), so it's excluded wherever a managed-SaaS user picks a provider.
export const CLOUD_PROVIDER_META: ProviderMeta[] = PROVIDER_META.filter((p) => p.id !== "lmstudio");

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

// Comfortably under rewrite-execute/generate-draft/critic's `maxDuration = 55`
// -- without this, the OpenAI SDK's own default (10 minutes) means a single
// slow cloud call can run well past whatever Vercel timeout the route has,
// guaranteeing a hard mid-request kill instead of a clean, retryable failure.
// Scoped to cloud providers only: local LM Studio calls aren't reachable from
// Vercel's serverless functions at all (self-hosted deployments that use it
// don't run under any Vercel timeout in the first place), and a large local
// model on modest hardware may legitimately need longer than this per call.
const CLOUD_PROVIDER_TIMEOUT_MS = 45_000;

/**
 * Returns an OpenAI SDK client configured for the chosen provider.
 * Anthropic supports the OpenAI-compatible messages API at
 * https://api.anthropic.com/v1  with an `x-api-key` / Bearer header.
 */
export function createProviderClient(settings: StandardLlmSettings): OpenAI {
  switch (settings.provider) {
    case "openai":
      return new OpenAI({
        apiKey: settings.apiKey || process.env.OPENAI_API_KEY || "",
        baseURL: settings.baseUrl,
        timeout: CLOUD_PROVIDER_TIMEOUT_MS,
      });

    case "anthropic": {
      const anthropicKey = (settings.apiKey || process.env.ANTHROPIC_API_KEY || "").trim();
      return new OpenAI({
        apiKey: anthropicKey,
        baseURL: settings.baseUrl || "https://api.anthropic.com/v1",
        defaultHeaders: {
          "anthropic-version": "2023-06-01",
          "x-api-key": anthropicKey,
        },
        timeout: CLOUD_PROVIDER_TIMEOUT_MS,
      });
    }

    case "google":
      return new OpenAI({
        apiKey: settings.apiKey || process.env.GOOGLE_API_KEY || "",
        baseURL:
          settings.baseUrl ||
          "https://generativelanguage.googleapis.com/v1beta/openai",
        timeout: CLOUD_PROVIDER_TIMEOUT_MS,
      });

    case "openrouter":
      return new OpenAI({
        apiKey: settings.apiKey || process.env.OPENROUTER_API_KEY || "",
        baseURL: settings.baseUrl || "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": process.env.OPENROUTER_APP_URL || "https://bookforge.app",
          "X-Title": "BookForge",
        },
        timeout: CLOUD_PROVIDER_TIMEOUT_MS,
      });

    case "lmstudio":
    default:
      return new OpenAI({
        apiKey: settings.apiKey || process.env.LMSTUDIO_API_KEY || "lm-studio",
        baseURL:
          settings.baseUrl ||
          process.env.LMSTUDIO_BASE_URL ||
          "http://localhost:1234/v1",
      });
  }
}

// ---------------------------------------------------------------------------
// Simple chat completion helper
// ---------------------------------------------------------------------------

export type ProviderChatParams = {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming["response_format"];
};

/**
 * Sends a chat completion request through whichever provider is configured.
 * Falls back to sensible defaults so callers don't need to repeat them.
 */
export async function providerChatCompletion(
  settings: StandardLlmSettings,
  params: ProviderChatParams,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = createProviderClient(settings);
  const meta = PROVIDER_META.find((p) => p.id === settings.provider);
  const model =
    params.model ||
    settings.model ||
    meta?.defaultModels[0] ||
    "gpt-4o";

  return client.chat.completions.create({
    ...params,
    model,
    temperature: params.temperature ?? settings.temperature ?? 0.7,
    max_tokens: params.max_tokens ?? settings.maxOutputTokens ?? 4096,
    stream: false,
  });
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

/**
 * Reads standard LLM provider settings from environment variables so the app
 * works without a DB row (useful for self-hosted / CLI usage).
 */
export function getStandardLlmSettingsFromEnv(): StandardLlmSettings | null {
  const provider = process.env.LLM_PROVIDER as LlmProvider | undefined;
  if (!provider || provider === "lmstudio") return null;
  return {
    provider,
    apiKey:
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      "",
    model: process.env.LLM_MODEL || undefined,
    baseUrl: process.env.LLM_BASE_URL || undefined,
    temperature: process.env.LLM_TEMPERATURE ? Number(process.env.LLM_TEMPERATURE) : undefined,
    maxOutputTokens: process.env.LLM_MAX_OUTPUT_TOKENS
      ? Number(process.env.LLM_MAX_OUTPUT_TOKENS)
      : undefined,
  };
}