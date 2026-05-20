import { DEFAULT_LMSTUDIO_BASE_URL } from "@/lib/lmstudio/client";
import { createClient } from "@/lib/supabase/server";
import type { LlmProvider, LmStudioSettings, StandardLlmSettings } from "@/lib/types";

type ExecutionMode = LmStudioSettings["executionMode"];

function toExecutionMode(value: unknown): ExecutionMode {
  if (value === "local" || value === "cloud") return value;
  return "auto";
}

export async function getUserLmStudioSettings(userId: string): Promise<LmStudioSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_settings")
    .select(
      "lmstudio_base_url,primary_rewrite_model,reasoning_model,extraction_model,embedding_model,reranker_model,quality_profile,context_window_tokens,temperature,top_p,repeat_penalty,max_output_tokens,llm_provider,llm_api_key,llm_model,llm_base_url,llm_temperature,llm_max_output_tokens,execution_mode",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const provider = (data?.llm_provider || "lmstudio") as LlmProvider;
  const standardSettings: StandardLlmSettings | null =
    provider !== "lmstudio"
      ? {
          provider,
          apiKey: data?.llm_api_key || undefined,
          model: data?.llm_model || undefined,
          baseUrl: data?.llm_base_url || undefined,
          temperature: data?.llm_temperature != null ? Number(data.llm_temperature) : undefined,
          maxOutputTokens: data?.llm_max_output_tokens != null ? Number(data.llm_max_output_tokens) : undefined,
        }
      : null;

  return {
    baseUrl: data?.lmstudio_base_url || DEFAULT_LMSTUDIO_BASE_URL,
    primaryRewriteModel: data?.primary_rewrite_model || process.env.LMSTUDIO_MODEL || undefined,
    reasoningModel: data?.reasoning_model || undefined,
    extractionModel: data?.extraction_model || undefined,
    embeddingModel: data?.embedding_model || undefined,
    rerankerModel: data?.reranker_model || undefined,
    qualityProfile: data?.quality_profile || "balanced",
    contextWindowTokens: Number(data?.context_window_tokens ?? 32768),
    temperature: Number(data?.temperature ?? 0.7),
    topP: Number(data?.top_p ?? 0.9),
    repeatPenalty: Number(data?.repeat_penalty ?? 1.05),
    maxOutputTokens: Number(data?.max_output_tokens ?? 4096),
    standardSettings,
    executionMode: toExecutionMode(data?.execution_mode),
  };
}
