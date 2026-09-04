const CLOUD_PROVIDER_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
};

/**
 * Thrown by selectAndPrepareActiveModel when a managed-SaaS user has no
 * cloud provider configured yet -- LM Studio can never be reachable from a
 * Vercel-hosted server, so falling through to the LM Studio orchestrator in
 * that case previously produced a raw, unhelpful "Connection error." (the
 * OpenAI SDK's own APIConnectionError message, which doesn't match any of
 * this file's ECONNREFUSED-style patterns below).
 */
export class AiEngineNotConfiguredError extends Error {
  constructor() {
    super("Connect an AI engine in Settings before generating -- this account hasn't configured one yet.");
    this.name = "AiEngineNotConfiguredError";
  }
}

export function getLmStudioErrorMessage(
  error: unknown,
  fallback: string,
  context: { model?: string; task?: string; modelSource?: string; configuredModels?: string[] } = {},
) {
  if (error instanceof AiEngineNotConfiguredError) return error.message;
  const message = extractErrorMessage(error);
  if (/Expected model:/i.test(message) || /Configured fallback order:/i.test(message)) {
    return message;
  }
  const modelLine = context.model ? `Expected model: ${context.model}.` : "";
  const taskLine = context.task ? `Task: ${context.task}.` : "";
  const sourceLine = context.modelSource ? `Selection source: ${context.modelSource}.` : "";
  const configuredLine = context.configuredModels?.filter(Boolean).length
    ? `Configured fallback order: ${context.configuredModels.filter(Boolean).join(" -> ")}.`
    : "";

  if (/model unloaded/i.test(message)) {
    return [
      "LM Studio says the selected model is unloaded.",
      modelLine,
      taskLine,
      sourceLine,
      configuredLine,
      "Open LM Studio, load that exact model, or choose a loaded model in Settings.",
    ].join(" ");
  }

  if (/model.*not.*found|not found.*model|unknown model/i.test(message)) {
    return [
      "LM Studio could not find the selected model.",
      modelLine,
      taskLine,
      sourceLine,
      configuredLine,
      "Choose one of the models shown in Settings, then save and retry.",
    ].join(" ");
  }

  if (/ECONNREFUSED|fetch failed|connection refused|Failed to fetch/i.test(message)) {
    const cloudLabel = context.modelSource ? CLOUD_PROVIDER_LABELS[context.modelSource] : undefined;
    if (cloudLabel) {
      return `BookForge could not reach ${cloudLabel}. This is usually a brief network or provider outage — wait a moment and retry.`;
    }
    return "BookForge could not reach LM Studio. Start the LM Studio local server and retry.";
  }

  return message || fallback;
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}
