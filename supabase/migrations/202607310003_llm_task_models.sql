-- Per-task cloud model overrides, mirroring the LM Studio local-model columns
-- (primary_rewrite_model / reasoning_model / extraction_model) so cloud
-- providers — especially OpenRouter, where cost/speed varies wildly by model
-- — can use a cheap fast model for high-volume critic calls and a stronger
-- one for full-manuscript rewrites, instead of one model for everything.
-- Each falls back to llm_model when unset. See src/lib/types.ts (StandardLlmSettings).
alter table public.user_settings
  add column if not exists llm_critic_model     text,
  add column if not exists llm_rewrite_model    text,
  add column if not exists llm_planning_model   text,
  add column if not exists llm_extraction_model text;

comment on column public.user_settings.llm_critic_model is
  'Per-task cloud model override for the 8 critic-lens calls. Falls back to llm_model when unset.';
comment on column public.user_settings.llm_rewrite_model is
  'Per-task cloud model override for full-manuscript rewrite-strategy passes (the main cost driver). Falls back to llm_model when unset.';
comment on column public.user_settings.llm_planning_model is
  'Per-task cloud model override for architecture/rewrite-plan/book-bible planning calls. Falls back to llm_model when unset.';
comment on column public.user_settings.llm_extraction_model is
  'Per-task cloud model override for extraction/summarization calls. Falls back to llm_model when unset.';
