-- Versioned model pricing reference. Not a single mutable row -- a margin
-- rollup over last month's calls must price them at last month's rate, or
-- every vendor price change corrupts historical margin data (confirmed live
-- this session: DeepSeek V4 Pro moved ~17% in 3 weeks).
create table public.model_pricing (
  model text not null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  provider text not null,
  input_usd_micros_per_million_tokens bigint not null,
  output_usd_micros_per_million_tokens bigint not null,
  source_note text,
  primary key (model, effective_from)
);

-- Exactly one "current" (effective_to is null) row per model.
create unique index model_pricing_current_idx on public.model_pricing (model) where effective_to is null;

alter table public.model_pricing enable row level security;

create policy "model pricing readable" on public.model_pricing
  for select using (auth.uid() is not null);

-- Seeded from live OpenRouter pricing fetched this session (2026-08-19).
insert into public.model_pricing (model, provider, input_usd_micros_per_million_tokens, output_usd_micros_per_million_tokens, source_note) values
  ('deepseek/deepseek-v4-pro', 'openrouter', 507000, 1014000, 'Live OpenRouter pricing page, fetched 2026-08-19.'),
  ('google/gemini-2.5-flash', 'openrouter', 300000, 2500000, 'Live OpenRouter pricing page, fetched 2026-08-19.'),
  ('anthropic/claude-haiku-4.5', 'openrouter', 1000000, 5000000, 'Live OpenRouter pricing page, fetched 2026-08-19.'),
  ('anthropic/claude-opus-5', 'openrouter', 5000000, 25000000, 'Live OpenRouter pricing page, fetched 2026-08-19.');

-- Tier lookup, factored out of is_model_allowed_for_user() so the telemetry
-- path (Phase 2) can snapshot a user's tier at call time without duplicating
-- the default-to-starter logic.
create or replace function public.get_user_subscription_tier(p_user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select tier_id from public.user_subscriptions where user_id = p_user_id and status = 'active'),
    'starter'
  );
$$;

grant execute on function public.get_user_subscription_tier(uuid) to authenticated;

create or replace function public.is_model_allowed_for_user(p_user_id uuid, p_model text, p_task text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tier_id text;
begin
  v_tier_id := public.get_user_subscription_tier(p_user_id);

  return exists (
    select 1
    from public.subscription_tier_models
    where tier_id = v_tier_id
      and model = p_model
      and (task = '*' or task = p_task)
  );
end;
$$;
