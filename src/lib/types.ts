export type ParsedParagraph = {
  paragraphNumber: number;
  text: string;
};

export type ParsedScene = {
  sceneNumber: number;
  title?: string;
  text: string;
  paragraphs: ParsedParagraph[];
};

export type ParsedChapter = {
  chapterNumber: number;
  title: string;
  text: string;
  scenes: ParsedScene[];
};

export type ParsedManuscript = {
  title: string;
  originalText: string;
  chapters: ParsedChapter[];
};

export type CriticLens =
  | "story_structure"
  | "prose_quality"
  | "continuity"
  | "character_depth"
  | "market_fit"
  | "contemporary_view"
  | "revision_priorities"
  | "dialogue_density";

export type LlmProvider = "lmstudio" | "openai" | "anthropic" | "google" | "openrouter";

/**
 * Which pipeline stage a model call is for. Shared by both the LM Studio
 * (local) task-model fields below and StandardLlmSettings.taskModels for
 * cloud providers — see selectAndPrepareActiveModel in
 * src/lib/lmstudio/orchestrator.ts, the single place that resolves a task
 * to an actual model for whichever provider is active.
 */
export type LmStudioTaskKind = "planning" | "rewrite" | "critic" | "extraction";

export type StandardLlmSettings = {
  provider: LlmProvider;
  apiKey?: string;
  /** Default/fallback model, used for any task without a specific override in taskModels. */
  model?: string;
  /**
   * Optional per-task overrides — e.g. a cheap fast model for high-volume
   * critic calls and a stronger one for full-manuscript rewrites. Most
   * useful with OpenRouter, where cost/speed varies widely by model; falls
   * back to `model` for any task not set here.
   */
  taskModels?: Partial<Record<LmStudioTaskKind, string>>;
  /** Only used for OpenAI-compatible custom endpoints */
  baseUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type LmStudioSettings = {
  baseUrl: string;
  apiKey?: string;
  primaryRewriteModel?: string;
  reasoningModel?: string;
  extractionModel?: string;
  embeddingModel?: string;
  rerankerModel?: string;
  qualityProfile: "fast" | "balanced" | "premium";
  contextWindowTokens: number;
  temperature: number;
  topP: number;
  repeatPenalty: number;
  maxOutputTokens: number;
  /** Non-null when the user has selected a cloud provider instead of LM Studio. */
  standardSettings: StandardLlmSettings | null;
  /**
   * auto  – cloud for reasoning tasks (critic, planning), local for extraction/rewrite
   * local – always LM Studio regardless of cloud configuration
   * cloud – always cloud provider regardless of task type
   */
  executionMode: "auto" | "local" | "cloud";
};
