export type RevisionMode =
  | "humanize"
  | "context_enhancement"
  | "readability"
  | "character_interaction"
  | "good_writer_motif"
  | "continuity_review"
  | "voice_preservation"
  | "pacing"
  | "dialogue_polish"
  | "show_dont_tell"
  | "chapter_ending"
  | "theological_alignment";

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
  | "theology_worldview"
  | "revision_priorities";

export type LlmProvider = "lmstudio" | "openai" | "anthropic" | "google";

export type StandardLlmSettings = {
  provider: LlmProvider;
  apiKey?: string;
  /** OpenAI / Anthropic / Google model name, e.g. "gpt-4o", "claude-3-5-sonnet-20241022", "gemini-1.5-pro" */
  model?: string;
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
};
