import type { LmStudioSettings } from "@/lib/types";

export type LmStudioModelSelection = {
  model: string;
  source: string;
  configuredModels: string[];
  availableModels: string[];
  usedLoadedFallback: boolean;
};

type ModelCandidate = {
  label: string;
  model?: string;
};

export function selectLoadedLmStudioModel({
  candidates,
  availableModels,
  defaultModel = "local-model",
}: {
  candidates: ModelCandidate[];
  availableModels: string[];
  defaultModel?: string;
}): LmStudioModelSelection {
  const configuredModels = candidates.map((candidate) =>
    candidate.model ? `${candidate.label}: ${candidate.model}` : `${candidate.label}: not configured`,
  );
  const configured = candidates.filter((candidate): candidate is Required<ModelCandidate> => Boolean(candidate.model));
  const available = new Set(availableModels);

  if (available.size > 0) {
    const loadedConfigured = configured.find((candidate) => available.has(candidate.model));
    if (loadedConfigured) {
      return {
        model: loadedConfigured.model,
        source: loadedConfigured.label,
        configuredModels,
        availableModels,
        usedLoadedFallback: configured[0]?.model !== loadedConfigured.model,
      };
    }

    return {
      model: availableModels[0],
      source: "Loaded LM Studio model fallback because configured task models are unavailable",
      configuredModels,
      availableModels,
      usedLoadedFallback: true,
    };
  }

  const firstConfigured = configured[0];
  return {
    model: firstConfigured?.model || defaultModel,
    source: firstConfigured?.label || "Default fallback because no task-specific model is configured",
    configuredModels,
    availableModels,
    usedLoadedFallback: false,
  };
}

export function getExtractionModelCandidates(settings: LmStudioSettings): ModelCandidate[] {
  return [
    { label: "Extraction model", model: settings.extractionModel },
    { label: "Primary rewrite model", model: settings.primaryRewriteModel },
    { label: "Reasoning model", model: settings.reasoningModel },
  ];
}

export function getDraftModelCandidates(settings: LmStudioSettings): ModelCandidate[] {
  return [
    { label: "Primary rewrite model", model: settings.primaryRewriteModel },
    { label: "Reasoning model", model: settings.reasoningModel },
    { label: "Extraction model", model: settings.extractionModel },
  ];
}

export function getReasoningModelCandidates(settings: LmStudioSettings): ModelCandidate[] {
  return [
    { label: "Reasoning model", model: settings.reasoningModel },
    { label: "Primary rewrite model", model: settings.primaryRewriteModel },
    { label: "Extraction model", model: settings.extractionModel },
  ];
}
