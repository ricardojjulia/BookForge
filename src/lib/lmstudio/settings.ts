import { DEFAULT_LMSTUDIO_BASE_URL } from "@/lib/lmstudio/client";
import { createClient } from "@/lib/supabase/server";
import type { LlmProvider, LmStudioSettings, StandardLlmSettings } from "@/lib/types";

function buildTaskModels(data: {
  llm_critic_model?: string | null;
  llm_rewrite_model?: string | null;
  llm_planning_model?: string | null;
  llm_extraction_model?: string | null;
} | null | undefined): StandardLlmSettings["taskModels"] {
  const taskModels: StandardLlmSettings["taskModels"] = {
    critic: data?.llm_critic_model || undefined,
    rewrite: data?.llm_rewrite_model || undefined,
    planning: data?.llm_planning_model || undefined,
    extraction: data?.llm_extraction_model || undefined,
  };
  return Object.values(taskModels).some(Boolean) ? taskModels : undefined;
}

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
      "lmstudio_base_url,primary_rewrite_model,reasoning_model,extraction_model,embedding_model,reranker_model,quality_profile,context_window_tokens,temperature,top_p,repeat_penalty,max_output_tokens,llm_provider,llm_api_key_secret_id,llm_model,llm_base_url,llm_temperature,llm_max_output_tokens,llm_critic_model,llm_rewrite_model,llm_planning_model,llm_extraction_model,execution_mode",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const provider = (data?.llm_provider || "lmstudio") as LlmProvider;
  // The API key is never stored in plaintext (see the 202608010001 migration)
  // — it lives in Supabase Vault, resolved here through a SECURITY DEFINER
  // function that only returns the caller's own key.
  const apiKey = data?.llm_api_key_secret_id
    ? ((await supabase.rpc("get_llm_api_key", { p_user_id: userId })).data as string | null) || undefined
    : undefined;
  const standardSettings: StandardLlmSettings | null =
    provider !== "lmstudio"
      ? {
          provider,
          apiKey,
          model: data?.llm_model || undefined,
          taskModels: buildTaskModels(data),
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
