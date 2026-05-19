-- Add standard LLM provider settings to user_settings
alter table public.user_settings
  add column if not exists llm_provider       text    not null default 'lmstudio',
  add column if not exists llm_api_key        text,
  add column if not exists llm_model          text,
  add column if not exists llm_base_url       text,
  add column if not exists llm_temperature    numeric,
  add column if not exists llm_max_output_tokens integer;

comment on column public.user_settings.llm_provider is
  'Active LLM provider: lmstudio | openai | anthropic | google';