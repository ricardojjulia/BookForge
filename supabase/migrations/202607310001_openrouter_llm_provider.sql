-- llm_provider has no CHECK constraint, so "openrouter" is already a valid
-- value with no schema change — this migration only updates the descriptive
-- comment to keep it accurate. See src/lib/types.ts (LlmProvider) and
-- docs/openrouter-integration-plan.md.
comment on column public.user_settings.llm_provider is
  'Active LLM provider: lmstudio | openai | anthropic | google | openrouter';
