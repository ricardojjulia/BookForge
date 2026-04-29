export type ModelRecommendation = {
  task: "primary_rewrite_model" | "reasoning_model" | "extraction_model" | "embedding_model" | "reranker_model";
  label: string;
  selectedModel: string;
  reason: string;
  alternatives: string[];
};

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
  const uniqueModels = Array.from(new Set(availableModels)).filter(Boolean);

  return (Object.keys(taskLabels) as ModelRecommendation["task"][]).map((task) => {
    const candidates = uniqueModels
      .map((model) => scoreModelForTask(model, task))
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

function scoreModelForTask(model: string, task: ModelRecommendation["task"]): Candidate {
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
  if (/qwen/.test(name)) add(18, "Qwen models are strong balanced local rewrite models");
  if (/llama|mistral|mixtral|gemma|yi/.test(name)) add(10, "general instruction model detected");
  if (/gguf|q[34568][_-]?k|q\d/.test(name)) add(8, "local quantized model detected");

  if (task === "primary_rewrite_model") {
    if (size >= 30 && size <= 40) add(70, "32B-class model fits Balanced Mode rewriting");
    else if (size >= 13 && size < 30) add(42, "14B-class model is usable for faster rewriting");
    else if (size >= 60) add(38, "70B-class model is high quality but heavier than Balanced Mode");
    if (/reason|r1|deepseek/.test(name)) add(-35, "reasoning models are better reserved for critique/planning");
    return result();
  }

  if (task === "reasoning_model") {
    if (/deepseek|r1|reason|thinking/.test(name)) add(80, "reasoning model detected");
    if (size >= 30 && size <= 40) add(55, "32B-class model fits Balanced Mode reasoning");
    else if (size >= 13 && size < 30) add(30, "14B-class reasoning fallback detected");
    else if (size >= 60) add(36, "larger reasoning model detected");
    return result();
  }

  if (task === "extraction_model") {
    if (size >= 13 && size < 30) add(70, "14B-class model fits extraction and summarization");
    else if (size >= 7 && size < 13) add(55, "7B-class model is acceptable for fast extraction");
    else if (size >= 30 && size <= 40) add(42, "32B-class model is strong but heavier for extraction");
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
