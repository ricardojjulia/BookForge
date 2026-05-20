/**
 * Unified LLM provider client factory.
 *
 * Supports:
 *   - LM Studio  (OpenAI-compatible local server)
 *   - OpenAI     (gpt-4o, gpt-4o-mini, o1, …)
 *   - Anthropic  (claude-3-5-sonnet, claude-3-haiku, …)
 *   - Google     (gemini-1.5-pro, gemini-1.5-flash, …)  via OpenAI-compatible endpoint
 *
 * All providers are normalised to a single `chatCompletion()` call that returns
 * an OpenAI-style `ChatCompletion` response so the rest of the codebase needs
 * no changes.
 */

import OpenAI from "openai";
import type { StandardLlmSettings, LlmProvider } from "@/lib/types";

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
    defaultModels: ["gpt-4o", "gpt-4o-mini", "o1-mini", "o1"],
    requiresApiKey: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultModels: [
      "claude-sonnet-4-6",
      "claude-opus-4-7",
      "claude-haiku-4-5-20251001",
    ],
    requiresApiKey: true,
  },
  {
    id: "google",
    label: "Google Gemini",
    defaultModels: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
    requiresApiKey: true,
    // Google exposes an OpenAI-compatible REST endpoint
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
];

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

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
      });
    }

    case "google":
      return new OpenAI({
        apiKey: settings.apiKey || process.env.GOOGLE_API_KEY || "",
        baseURL:
          settings.baseUrl ||
          "https://generativelanguage.googleapis.com/v1beta/openai",
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
      "",
    model: process.env.LLM_MODEL || undefined,
    baseUrl: process.env.LLM_BASE_URL || undefined,
    temperature: process.env.LLM_TEMPERATURE ? Number(process.env.LLM_TEMPERATURE) : undefined,
    maxOutputTokens: process.env.LLM_MAX_OUTPUT_TOKENS
      ? Number(process.env.LLM_MAX_OUTPUT_TOKENS)
      : undefined,
  };
}