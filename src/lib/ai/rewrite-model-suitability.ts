import { matchLocalModelFamily } from "@/lib/ai/model-catalog";

export type RewriteModelSuitability = {
  model: string;
  score: number;
  label: "excellent" | "good" | "limited" | "unsuitable";
  reasons: string[];
  math: string[];
};

export type RewriteModelSelection = {
  threshold: number;
  best: RewriteModelSuitability | null;
  candidates: RewriteModelSuitability[];
  warning: string | null;
};

export function selectBestRewriteModel(
  availableModels: string[],
  input: { qualityProfile: string; contextWindowTokens: number },
): RewriteModelSelection {
  const threshold = 80;
  const candidates = Array.from(new Set(availableModels))
    .filter(Boolean)
    .map((model) => scoreRewriteModel(model, input))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.model.localeCompare(b.model));
  const best = candidates[0] || null;

  return {
    threshold,
    best,
    candidates,
    warning:
      best && best.score >= threshold
        ? null
        : best
          ? `Best available rewrite model is ${best.model} at ${best.score}%. It is below the 80% suitability target. Load a stronger instruction model or lower rewrite ambition.`
          : "No suitable rewrite model was detected in LM Studio. Load an instruction/chat model before running a full-book rewrite.",
  };
}

function scoreRewriteModel(
  model: string,
  input: { qualityProfile: string; contextWindowTokens: number },
): RewriteModelSuitability {
  const name = model.toLowerCase();
  const reasons: string[] = [];
  const math: string[] = [];
  let score = 0;
  const size = getModelSizeB(name);
  const quantization = getQuantization(name);
  // Family identity (Qwen, Llama, DeepSeek-R1, bge-m3, ...) comes from the shared
  // catalog so this file and model-recommendations.ts never drift apart.
  const family = matchLocalModelFamily(name);

  if (isEmbeddingOrRankingModel(name)) {
    return {
      model,
      score: 0,
      label: "unsuitable",
      reasons: ["Embedding/reranker models cannot rewrite prose."],
      math: ["embedding/reranker model => score 0"],
    };
  }

  add(18, "generation model", "base generation capability");

  const instructTagged = /instruct|chat|assistant|it\b/.test(name);
  if (instructTagged) add(18, "instruction tuned", "instruction/chat signal");

  if (family?.kind === "general") {
    const bonus = family.taskAffinity.primary_rewrite_model ?? 10;
    add(bonus, `${family.label} is strong for local rewriting (${family.strengths[0]})`, "rewrite family fit");
    if (!instructTagged) add(12, `${family.label} is a modern chat-capable family`, "family signal");
  }

  if (size >= 28 && size <= 40) add(24, "30B-class model fits balanced rewrite quality/speed", "size fit");
  else if (size >= 60) add(input.qualityProfile === "premium" ? 25 : 18, "70B-class model has high quality but heavier latency", "size fit");
  else if (size >= 13 && size < 28) add(16, "14B-20B class is usable but less ideal for full-book rewrite", "size fit");
  else if (size >= 7 && size < 13) add(9, "7B-8B class is fast but weaker for full-book rewrite", "size fit");
  else if (/mistral-small/.test(name)) add(18, "Mistral Small class is a plausible rewrite fallback", "size inferred from model family");
  else add(4, "model size unknown", "size unknown");

  if (input.contextWindowTokens >= 32768) add(12, "configured context window supports chapter-level packets", "context window");
  else if (input.contextWindowTokens >= 16384) add(8, "configured context window supports compact context packets", "context window");
  else add(3, "small context window requires smaller rewrite units", "context window");

  if (quantization) {
    if (/q5|q6|q8/i.test(quantization)) add(8, "higher quantization preserves prose quality", "quantization");
    else if (/q4/i.test(quantization)) add(6, "Q4 quantization is acceptable for local rewrite", "quantization");
    else if (/q2|q3/i.test(quantization)) add(2, "low quantization may hurt prose nuance", "quantization");
  } else {
    add(5, "quantization unknown", "quantization unknown");
  }

  // Known reasoning/coder families are flagged via the catalog; the regex
  // fallback still catches unrecognized model names carrying the same signal.
  const looksReasoning = family?.kind === "reasoning" || (!family && /reason|deepseek|r1|thinking/.test(name));
  const looksCoder = family?.kind === "code" || (!family && /coder|code/.test(name));
  if (looksReasoning) subtract(18, "reasoning model is better for planning/critique than final prose rewrite");
  if (looksCoder) subtract(16, "coder model is not ideal for literary rewrite");

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    model,
    score: finalScore,
    label: finalScore >= 88 ? "excellent" : finalScore >= 80 ? "good" : finalScore >= 55 ? "limited" : "unsuitable",
    reasons: reasons.slice(0, 5),
    math,
  };

  function add(points: number, reason: string, label: string) {
    score += points;
    reasons.push(reason);
    math.push(`${label}: +${points}`);
  }

  function subtract(points: number, reason: string) {
    score -= points;
    reasons.push(reason);
    math.push(`${reason}: -${points}`);
  }
}

function getModelSizeB(name: string) {
  const billion = name.match(/(\d+(?:\.\d+)?)\s*b\b/);
  if (billion) return Number(billion[1]);
  const compact = name.match(/(?:^|[-_/ ])(\d{1,3})(?:b)(?:[-_/ ]|$)/);
  return compact ? Number(compact[1]) : 0;
}

function getQuantization(name: string) {
  return name.match(/\bq[2-8](?:_[a-z0-9]+)?(?:_[a-z0-9]+)?\b/i)?.[0] || "";
}

function isEmbeddingOrRankingModel(name: string) {
  const kind = matchLocalModelFamily(name)?.kind;
  if (kind === "embedding" || kind === "reranker") return true;
  return /embed|embedding|rerank|reranker|cross[-_ ]?encoder|\bbge[-_ ]?m3\b|nomic/.test(name);
}
