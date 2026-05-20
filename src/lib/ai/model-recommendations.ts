export type ModelRecommendation = {
  task: "primary_rewrite_model" | "reasoning_model" | "extraction_model" | "embedding_model" | "reranker_model";
  label: string;
  selectedModel: string;
  reason: string;
  alternatives: string[];
};

export type QualityProfile = "fast" | "balanced" | "premium";

type Candidate = {
  model: string;
  score: number;
  reason: string;
};

const taskLabels: Record<ModelRecommendation["task"], string> = {
  primary_rewrite_model: "Primary rewrite",
  reasoning_model: "Reasoning",
  extraction_model: "Extraction",
  embedding_model: "Embedding",
  reranker_model: "Reranker",
};

export function buildBalancedRecommendations(availableModels: string[]): ModelRecommendation[] {
  return buildModelRecommendations(availableModels, "balanced");
}

export function buildModelRecommendations(
  availableModels: string[],
  profile: QualityProfile = "balanced",
): ModelRecommendation[] {
  const uniqueModels = Array.from(new Set(availableModels)).filter(Boolean);

  return (Object.keys(taskLabels) as ModelRecommendation["task"][]).map((task) => {
    const candidates = uniqueModels
      .map((model) => scoreModelForTask(model, task, profile))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.model.localeCompare(b.model));

    const selected = candidates[0];
    return {
      task,
      label: taskLabels[task],
      selectedModel: selected?.model || "",
      reason: selected?.reason || "No suitable installed model was detected for this task.",
      alternatives: candidates.slice(1, 4).map((candidate) => candidate.model),
    };
  });
}

function scoreModelForTask(model: string, task: ModelRecommendation["task"], profile: QualityProfile): Candidate {
  const name = model.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  const size = getModelSize(name);

  if (task === "embedding_model") {
    if (/\bbge[-_ ]?m3\b/.test(name)) add(120, "bge-m3 is the preferred embedding model");
    if (/nomic.*embed|embed.*nomic/.test(name)) add(95, "nomic embed model detected");
    if (/embed|embedding/.test(name)) add(70, "embedding model detected");
    if (isChatOrGenerationModel(name)) add(-60, "generation model is not ideal for embeddings");
    return result();
  }

  if (task === "reranker_model") {
    if (/rerank|reranker|cross[-_ ]?encoder/.test(name)) add(100, "reranker/cross-encoder model detected");
    if (/\bbge\b/.test(name)) add(20, "BGE model family is commonly used for ranking");
    if (isEmbeddingModel(name)) add(-50, "embedding model is not a reranker");
    return result();
  }

  if (isEmbeddingModel(name) || /rerank|reranker/.test(name)) {
    return { model, score: 0, reason: "Not a generation model." };
  }

  if (/instruct|chat|it\b|assistant/.test(name)) add(30, "instruction-tuned model detected");
  if (/qwen/.test(name)) add(18, "Qwen models are strong local rewrite models");
  if (/llama|mistral|mixtral|gemma|yi/.test(name)) add(10, "general instruction model detected");
  if (/gguf|q[34568][_-]?k|q\d/.test(name)) add(8, "local quantized model detected");

  if (task === "primary_rewrite_model") {
    addSizeFit(profile, size, {
      fast: [
        [7, 15, 72, "7B-14B model fits Fast Mode rewriting"],
        [15, 30, 50, "mid-size model is usable for Fast Mode rewriting"],
        [30, 45, 24, "32B-class model is higher quality but slower for Fast Mode"],
        [60, Infinity, 10, "large model is high quality but heavy for Fast Mode"],
      ],
      balanced: [
        [30, 45, 70, "32B-class model fits Balanced Mode rewriting"],
        [13, 30, 42, "14B-class model is usable for faster rewriting"],
        [60, Infinity, 38, "70B-class model is high quality but heavier than Balanced Mode"],
      ],
      premium: [
        [60, Infinity, 86, "large model fits Premium Mode rewriting"],
        [30, 45, 68, "32B-class model is a strong Premium Mode fallback"],
        [13, 30, 32, "mid-size model is usable when larger models are unavailable"],
      ],
    });
    if (/reason|r1|deepseek/.test(name)) add(-35, "reasoning models are better reserved for critique/planning");
    return result();
  }

  if (task === "reasoning_model") {
    if (/deepseek|r1|reason|thinking/.test(name)) add(80, "reasoning model detected");
    addSizeFit(profile, size, {
      fast: [
        [7, 15, 54, "7B-14B model keeps Fast Mode reasoning responsive"],
        [15, 30, 42, "mid-size reasoning fallback detected"],
        [30, 45, 30, "32B-class model is strong but slower for Fast Mode"],
        [60, Infinity, 12, "large reasoning model detected"],
      ],
      balanced: [
        [30, 45, 55, "32B-class model fits Balanced Mode reasoning"],
        [13, 30, 30, "14B-class reasoning fallback detected"],
        [60, Infinity, 36, "larger reasoning model detected"],
      ],
      premium: [
        [60, Infinity, 74, "large model fits Premium Mode reasoning"],
        [30, 45, 62, "32B-class reasoning model is a strong Premium Mode fallback"],
        [13, 30, 24, "mid-size reasoning fallback detected"],
      ],
    });
    return result();
  }

  if (task === "extraction_model") {
    addSizeFit(profile, size, {
      fast: [
        [7, 15, 78, "7B-14B model fits Fast Mode extraction"],
        [15, 30, 50, "mid-size model is usable for extraction"],
        [30, 45, 22, "32B-class model is strong but slower for Fast Mode extraction"],
        [60, Infinity, 8, "large model is usually unnecessary for extraction"],
      ],
      balanced: [
        [13, 30, 70, "14B-class model fits extraction and summarization"],
        [7, 13, 55, "7B-class model is acceptable for fast extraction"],
        [30, 45, 42, "32B-class model is strong but heavier for extraction"],
      ],
      premium: [
        [30, 45, 62, "32B-class model gives stronger Premium Mode extraction"],
        [13, 30, 58, "14B-class model remains efficient for extraction"],
        [60, Infinity, 34, "large model is high quality but usually unnecessary for extraction"],
        [7, 13, 24, "7B-class model is a fast fallback for extraction"],
      ],
    });
    if (/instruct|chat|it\b/.test(name)) add(22, "instruction model works well for structured extraction");
    if (/reason|r1|deepseek/.test(name)) add(-20, "reasoning model is usually unnecessary for extraction");
    return result();
  }

  return result();

  function add(points: number, reason: string) {
    score += points;
    if (points > 0) reasons.push(reason);
  }

  function result(): Candidate {
    return {
      model,
      score,
      reason: reasons.slice(0, 2).join("; ") || "Detected as the best available fit.",
    };
  }

  function addSizeFit(
    selectedProfile: QualityProfile,
    modelSize: number,
    rangesByProfile: Record<QualityProfile, Array<[number, number, number, string]>>,
  ) {
    for (const [min, max, points, reason] of rangesByProfile[selectedProfile]) {
      if (modelSize >= min && modelSize < max) {
        add(points, reason);
        return;
      }
    }
  }
}

function getModelSize(name: string) {
  const billion = name.match(/(\d+(?:\.\d+)?)\s*b\b/);
  if (billion) return Number(billion[1]);

  const compact = name.match(/(?:^|[-_ ])(\d{1,3})(?:b|B)(?:[-_ ]|$)/);
  if (compact) return Number(compact[1]);

  return 0;
}

function isEmbeddingModel(name: string) {
  return /embed|embedding|\bbge[-_ ]?m3\b|nomic/.test(name);
}

function isChatOrGenerationModel(name: string) {
  return /instruct|chat|qwen|llama|mistral|gemma|deepseek|r1/.test(name);
}
