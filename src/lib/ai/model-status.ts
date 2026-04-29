import type { LmStudioSettings } from "@/lib/types";

export type TaskModelKey =
  | "primaryRewriteModel"
  | "reasoningModel"
  | "extractionModel"
  | "embeddingModel"
  | "rerankerModel";

export const taskModelLabels: Record<TaskModelKey, string> = {
  primaryRewriteModel: "Primary rewrite",
  reasoningModel: "Reasoning",
  extractionModel: "Extraction",
  embeddingModel: "Embedding",
  rerankerModel: "Reranker",
};

export function getConfiguredTaskModels(settings: LmStudioSettings) {
  return Object.entries(taskModelLabels).map(([key, label]) => ({
    key: key as TaskModelKey,
    label,
    model: settings[key as TaskModelKey] || "",
  }));
}

export function isModelAvailable(model: string | undefined, availableModels: string[]) {
  if (!model) return false;
  return availableModels.includes(model);
}
