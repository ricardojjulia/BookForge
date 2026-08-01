/**
 * Model catalog — the single reference for "what LLMs are available and what
 * are they good at" across both cloud providers and locally-hosted (LM Studio)
 * models.
 *
 * This is the one place to update when a new model ships. Everything else
 * (provider defaults, onboarding, the LM Studio scoring heuristics) reads
 * from here instead of keeping its own hardcoded copy — that duplication is
 * what let the old model IDs go stale in the first place.
 *
 * Cloud model IDs: only the Anthropic entries below are treated as
 * authoritative (this repo has tooling that tracks Claude's current model
 * lineup). OpenAI and Google entries are best-effort and should be
 * spot-checked against each provider's own docs periodically. OpenRouter
 * entries use OpenRouter's own namespaced IDs (e.g. "deepseek/deepseek-v4-pro")
 * and were checked against the live `GET /api/v1/models` catalog on
 * 2026-07-31 — re-verify periodically, since OpenRouter model IDs/pricing
 * change as new versions ship. See docs/openrouter-integration-plan.md.
 */

import type { LlmProvider, LmStudioTaskKind } from "@/lib/types";

// ---------------------------------------------------------------------------
// Cloud models
// ---------------------------------------------------------------------------

export type CloudModelInfo = {
  provider: Exclude<LlmProvider, "lmstudio">;
  id: string;
  label: string;
  contextWindowTokens: number;
  /** Short tags summarizing what the model is strong at. */
  strengths: string[];
  /** One-line guidance on when to reach for this model in Book Forge specifically. */
  bestFor: string;
  costTier: "low" | "medium" | "high" | "premium";
};

export const CLOUD_MODEL_CATALOG: CloudModelInfo[] = [
  // --- Anthropic (authoritative) ------------------------------------------
  {
    provider: "anthropic",
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    contextWindowTokens: 1_000_000,
    strengths: ["near-Opus quality", "fast", "cost-efficient", "coding/agentic"],
    bestFor: "The default balanced choice — strong rewrite and critique quality at a fraction of Opus cost/latency.",
    costTier: "medium",
  },
  {
    provider: "anthropic",
    id: "claude-opus-5",
    label: "Claude Opus 5",
    contextWindowTokens: 1_000_000,
    strengths: ["deep reasoning", "long-horizon agentic work", "complex rewrite/critique"],
    bestFor: "Highest-quality full-book rewrites, architecture planning, and critique passes where cost is secondary to quality.",
    costTier: "premium",
  },
  {
    provider: "anthropic",
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    contextWindowTokens: 200_000,
    strengths: ["fastest", "cheapest", "good for short/simple tasks"],
    bestFor: "Lightweight extraction, tagging, or summarization tasks where speed and cost matter more than nuance.",
    costTier: "low",
  },

  // --- OpenAI (best-effort — verify against platform.openai.com/docs before relying on it) ---
  {
    provider: "openai",
    id: "gpt-5",
    label: "GPT-5",
    contextWindowTokens: 400_000,
    strengths: ["strong general reasoning", "coding", "long context"],
    bestFor: "Balanced high-quality option when the user prefers OpenAI over Anthropic.",
    costTier: "premium",
  },
  {
    provider: "openai",
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    contextWindowTokens: 400_000,
    strengths: ["fast", "cheaper than GPT-5", "good instruction following"],
    bestFor: "Cost-sensitive extraction/summarization tasks on the OpenAI side.",
    costTier: "medium",
  },
  {
    provider: "openai",
    id: "gpt-4.1",
    label: "GPT-4.1",
    contextWindowTokens: 1_000_000,
    strengths: ["very long context", "steady instruction following"],
    bestFor: "Large-document ingestion tasks that need a huge context window.",
    costTier: "medium",
  },
  {
    provider: "openai",
    id: "o4-mini",
    label: "o4-mini",
    contextWindowTokens: 200_000,
    strengths: ["reasoning-specialized", "math/logic", "planning"],
    bestFor: "Structural/architecture planning tasks that benefit from an explicit reasoning model.",
    costTier: "medium",
  },

  // --- Google (best-effort — verify against ai.google.dev docs before relying on it) ---
  {
    provider: "google",
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    contextWindowTokens: 1_000_000,
    strengths: ["fast", "cheap", "long context"],
    bestFor: "High-volume extraction/summarization over long documents at low cost.",
    costTier: "low",
  },
  {
    provider: "google",
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    contextWindowTokens: 1_000_000,
    strengths: ["very long context", "multimodal", "strong reasoning"],
    bestFor: "Whole-manuscript context tasks (continuity checks, drift detection) that benefit from huge context windows.",
    costTier: "high",
  },
  {
    provider: "google",
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    contextWindowTokens: 1_000_000,
    strengths: ["fast", "cheapest Gemini tier"],
    bestFor: "Legacy/compatibility fallback when 2.5 models aren't available on the account.",
    costTier: "low",
  },

  // --- OpenRouter (one API key, many backends — pricing verified live 2026-07-31, see docs/openrouter-integration-plan.md) ---
  {
    provider: "openrouter",
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite (OpenRouter)",
    contextWindowTokens: 1_000_000,
    strengths: ["fastest", "cheapest reliable option", "structured JSON output"],
    bestFor: "Default for the 8 critic lenses — high call volume, short prompts, cost is a rounding error here.",
    costTier: "low",
  },
  {
    provider: "openrouter",
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash (OpenRouter)",
    contextWindowTokens: 1_000_000,
    strengths: ["cheapest of the shortlist", "fast MoE (13B active params)"],
    bestFor: "Critic-lens alternate/fallback when provider diversity or lower cost is preferred over Gemini.",
    costTier: "low",
  },
  {
    provider: "openrouter",
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro (OpenRouter)",
    contextWindowTokens: 1_000_000,
    strengths: ["best cost/quality balance for long-form rewrite", "long context"],
    bestFor: "Default for full-manuscript rewrite-strategy passes (rewrite-execute) — the actual cost driver in the pipeline.",
    costTier: "low",
  },
  {
    provider: "openrouter",
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash (OpenRouter)",
    contextWindowTokens: 1_000_000,
    strengths: ["fast", "cheap input", "long context"],
    bestFor: "Rewrite-pass alternate to DeepSeek V4 Pro when a call is input-token-heavy (large context packets).",
    costTier: "low",
  },
  {
    provider: "openrouter",
    id: "anthropic/claude-haiku-4.5",
    label: "Claude Haiku 4.5 (OpenRouter)",
    contextWindowTokens: 200_000,
    strengths: ["fast", "strong prose/instruction-following", "premium but not wasteful"],
    bestFor: "Pro/Studio-tier premium unlock for rewrite passes and drafting.",
    costTier: "medium",
  },
  {
    provider: "openrouter",
    id: "openai/gpt-5-mini",
    label: "GPT-5 Mini (OpenRouter)",
    contextWindowTokens: 400_000,
    strengths: ["cheapest true premium tier", "good instruction following"],
    bestFor: "Pro/Studio-tier premium unlock when the user prefers OpenAI-family output over Anthropic.",
    costTier: "medium",
  },
  {
    provider: "openrouter",
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro (OpenRouter)",
    contextWindowTokens: 1_000_000,
    strengths: ["flagship reasoning", "very long context", "multimodal"],
    bestFor: "Studio-tier opt-in for critic/revision passes that genuinely need flagship-level reasoning.",
    costTier: "high",
  },
];

export function getCloudModelsForProvider(provider: Exclude<LlmProvider, "lmstudio">): CloudModelInfo[] {
  return CLOUD_MODEL_CATALOG.filter((entry) => entry.provider === provider);
}

export function getCloudModelInfo(provider: LlmProvider, id: string): CloudModelInfo | null {
  return CLOUD_MODEL_CATALOG.find((entry) => entry.provider === provider && entry.id === id) || null;
}

/**
 * Recommended per-task OpenRouter models — a cheap fast model for
 * high-volume critic/extraction calls, a stronger one for the
 * full-manuscript rewrite passes that actually drive cost, and a
 * mid-tier model for lower-volume architecture/planning calls. See
 * docs/openrouter-integration-plan.md for the cost reasoning behind each
 * pick. Used to pre-fill the onboarding wizard's "optimize per feature"
 * default — the user can still override any of them.
 */
export const OPENROUTER_TASK_MODEL_DEFAULTS: Record<LmStudioTaskKind, string> = {
  critic: "google/gemini-2.5-flash-lite",
  extraction: "google/gemini-2.5-flash-lite",
  rewrite: "deepseek/deepseek-v4-pro",
  planning: "anthropic/claude-haiku-4.5",
};

// ---------------------------------------------------------------------------
// Local (LM Studio) model families
// ---------------------------------------------------------------------------

export type LocalModelTaskKind =
  | "primary_rewrite_model"
  | "reasoning_model"
  | "extraction_model"
  | "embedding_model"
  | "reranker_model";

export type LocalModelFamilyKind = "general" | "reasoning" | "code" | "embedding" | "reranker";

export type LocalModelFamily = {
  id: string;
  label: string;
  /** Matched against the lowercased model name/id reported by LM Studio. */
  match: RegExp;
  kind: LocalModelFamilyKind;
  strengths: string[];
  /** Extra scoring points to add per task when this family matches (on top of size/quantization scoring). */
  taskAffinity: Partial<Record<LocalModelTaskKind, number>>;
  notes?: string;
};

/**
 * Ordered most-specific-first: a "qwen2.5-coder" model should match the
 * `qwen-coder` entry, not the generic `qwen` entry, so code-specialized and
 * reasoning-specialized variants are listed before their parent family.
 */
export const LOCAL_MODEL_FAMILIES: LocalModelFamily[] = [
  // --- Reasoning-specialized (checked before generic families) ------------
  {
    id: "deepseek-r1",
    label: "DeepSeek-R1",
    match: /deepseek.*r1|r1.*deepseek/,
    kind: "reasoning",
    strengths: ["chain-of-thought reasoning", "math/logic", "planning"],
    taskAffinity: { reasoning_model: 30, primary_rewrite_model: -35, extraction_model: -20 },
    notes: "Reasoning-distilled model; strong for critique/planning, overkill and slower for prose rewriting.",
  },
  {
    id: "qwq",
    label: "QwQ",
    match: /\bqwq\b/,
    kind: "reasoning",
    strengths: ["reasoning", "math"],
    taskAffinity: { reasoning_model: 26, primary_rewrite_model: -30 },
  },

  // --- Code-specialized (checked before generic families) -----------------
  {
    id: "qwen-coder",
    label: "Qwen Coder",
    match: /qwen.*coder|coder.*qwen/,
    kind: "code",
    strengths: ["code generation", "structured output"],
    taskAffinity: { extraction_model: 10, primary_rewrite_model: -18, reasoning_model: -10 },
    notes: "Code-tuned variant; decent at structured extraction, not ideal for literary prose.",
  },
  {
    id: "deepseek-coder",
    label: "DeepSeek Coder",
    match: /deepseek.*coder|coder.*deepseek/,
    kind: "code",
    strengths: ["code generation", "structured output"],
    taskAffinity: { extraction_model: 10, primary_rewrite_model: -18, reasoning_model: -10 },
  },
  {
    id: "starcoder",
    label: "StarCoder",
    match: /starcoder|codellama|code-llama/,
    kind: "code",
    strengths: ["code generation"],
    taskAffinity: { extraction_model: 6, primary_rewrite_model: -20, reasoning_model: -12 },
  },

  // --- General instruction-tuned families ----------------------------------
  {
    id: "qwen",
    label: "Qwen",
    match: /qwen/,
    kind: "general",
    strengths: ["strong multilingual instruction-following", "efficient at small sizes", "solid rewrite quality"],
    taskAffinity: { primary_rewrite_model: 13, reasoning_model: 6, extraction_model: 8 },
  },
  {
    id: "llama",
    label: "Llama",
    match: /\bllama/,
    kind: "general",
    strengths: ["well-rounded general prose", "broad tool ecosystem support"],
    taskAffinity: { primary_rewrite_model: 10, reasoning_model: 4, extraction_model: 6 },
  },
  {
    id: "mistral-large",
    label: "Mistral Large",
    match: /mistral[-_ ]?large/,
    kind: "general",
    strengths: ["strong prose quality", "good instruction following at large size"],
    taskAffinity: { primary_rewrite_model: 14, reasoning_model: 8 },
  },
  {
    id: "mistral-small",
    label: "Mistral Small",
    match: /mistral[-_ ]?small/,
    kind: "general",
    strengths: ["efficient", "fast", "plausible rewrite fallback at small size"],
    taskAffinity: { primary_rewrite_model: 8, extraction_model: 10 },
  },
  {
    id: "mixtral",
    label: "Mixtral",
    match: /mixtral/,
    kind: "general",
    strengths: ["mixture-of-experts efficiency", "solid general prose"],
    taskAffinity: { primary_rewrite_model: 9, reasoning_model: 5 },
  },
  {
    id: "mistral",
    label: "Mistral",
    match: /mistral/,
    kind: "general",
    strengths: ["efficient", "strong general prose family"],
    taskAffinity: { primary_rewrite_model: 10, reasoning_model: 4, extraction_model: 6 },
  },
  {
    id: "gemma",
    label: "Gemma",
    match: /gemma/,
    kind: "general",
    strengths: ["efficient small models", "good instruction following per parameter"],
    taskAffinity: { primary_rewrite_model: 9, extraction_model: 7 },
  },
  {
    id: "glm",
    label: "GLM",
    match: /\bglm[-_]?\d|chatglm/,
    kind: "general",
    strengths: ["bilingual (EN/ZH)", "agentic tool use", "long context"],
    taskAffinity: { primary_rewrite_model: 10, reasoning_model: 8, extraction_model: 8 },
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    match: /deepseek/,
    kind: "general",
    strengths: ["strong reasoning-adjacent quality", "cost-effective at size"],
    taskAffinity: { primary_rewrite_model: 6, reasoning_model: 14, extraction_model: 6 },
  },
  {
    id: "phi",
    label: "Phi",
    match: /\bphi[-_]?\d/,
    kind: "general",
    strengths: ["very efficient for its size", "good reasoning-per-parameter", "runs well on modest hardware"],
    taskAffinity: { extraction_model: 10, reasoning_model: 8, primary_rewrite_model: 4 },
  },
  {
    id: "gpt-oss",
    label: "GPT-OSS",
    match: /gpt-oss/,
    kind: "general",
    strengths: ["strong open-weight reasoning", "general purpose"],
    taskAffinity: { primary_rewrite_model: 8, reasoning_model: 12, extraction_model: 8 },
  },
  {
    id: "yi",
    label: "Yi",
    match: /\byi[-_]?\d|\byi\b/,
    kind: "general",
    strengths: ["bilingual general purpose"],
    taskAffinity: { primary_rewrite_model: 6, extraction_model: 5 },
  },
  {
    id: "command-r",
    label: "Command R",
    match: /command-?r/,
    kind: "general",
    strengths: ["retrieval/tool use", "long context grounding"],
    taskAffinity: { extraction_model: 12, reasoning_model: 6, primary_rewrite_model: 4 },
  },
  {
    id: "granite",
    label: "Granite",
    match: /granite/,
    kind: "general",
    strengths: ["enterprise-tuned instruction following"],
    taskAffinity: { extraction_model: 8, primary_rewrite_model: 4 },
  },

  // --- Embedding families ---------------------------------------------------
  {
    id: "bge-m3",
    label: "BGE-M3",
    match: /\bbge[-_ ]?m3\b/,
    kind: "embedding",
    strengths: ["multilingual embeddings", "long-document retrieval"],
    taskAffinity: { embedding_model: 40 },
  },
  {
    id: "nomic-embed",
    label: "Nomic Embed",
    match: /nomic.*embed|embed.*nomic/,
    kind: "embedding",
    strengths: ["general-purpose text embeddings", "long context"],
    taskAffinity: { embedding_model: 25 },
  },
  {
    id: "gte",
    label: "GTE",
    match: /\bgte[-_](?:base|large|small|qwen)/,
    kind: "embedding",
    strengths: ["general text embeddings"],
    taskAffinity: { embedding_model: 20 },
  },
  {
    id: "e5",
    label: "E5",
    match: /\be5[-_](?:base|large|small)/,
    kind: "embedding",
    strengths: ["general text embeddings"],
    taskAffinity: { embedding_model: 18 },
  },
  {
    id: "mxbai-embed",
    label: "mxbai-embed",
    match: /mxbai.*embed/,
    kind: "embedding",
    strengths: ["general text embeddings"],
    taskAffinity: { embedding_model: 18 },
  },
  {
    id: "embed-generic",
    label: "Embedding model",
    match: /embed|embedding/,
    kind: "embedding",
    strengths: ["text embeddings"],
    taskAffinity: { embedding_model: 10 },
  },

  // --- Reranker families ------------------------------------------------------
  {
    id: "bge-reranker",
    label: "BGE Reranker",
    match: /bge[-_ ]?reranker/,
    kind: "reranker",
    strengths: ["cross-encoder reranking"],
    taskAffinity: { reranker_model: 40 },
  },
  {
    id: "mxbai-rerank",
    label: "mxbai-rerank",
    match: /mxbai.*rerank/,
    kind: "reranker",
    strengths: ["cross-encoder reranking"],
    taskAffinity: { reranker_model: 35 },
  },
  {
    id: "jina-reranker",
    label: "Jina Reranker",
    match: /jina.*rerank/,
    kind: "reranker",
    strengths: ["cross-encoder reranking", "multilingual"],
    taskAffinity: { reranker_model: 35 },
  },
  {
    id: "reranker-generic",
    label: "Reranker / cross-encoder",
    match: /rerank|reranker|cross[-_ ]?encoder/,
    kind: "reranker",
    strengths: ["reranking"],
    taskAffinity: { reranker_model: 20 },
  },
];

/**
 * Returns the most specific matching family for a (lowercased or raw) local
 * model name. `LOCAL_MODEL_FAMILIES` is ordered most-specific-first, so the
 * first match wins (e.g. "qwen2.5-coder-32b" matches `qwen-coder`, not `qwen`).
 */
export function matchLocalModelFamily(modelName: string): LocalModelFamily | null {
  const name = modelName.toLowerCase();
  return LOCAL_MODEL_FAMILIES.find((family) => family.match.test(name)) || null;
}
