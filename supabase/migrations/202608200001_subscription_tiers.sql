-- Subscription tiers for the managed-SaaS deployment (self-hosted is untouched
-- and unrestricted -- see src/lib/deployment/mode.ts / isManagedSaasDeployment()).
-- Tiers are rows, not a Postgres enum, and the model allowlist is a join table,
-- specifically so pricing/allowlist changes never require a deploy.

create table public.subscription_tiers (
  id text primary key,
  display_name text not null,
  monthly_price_usd_cents integer not null,
  monthly_credit_cap_usd_micros bigint not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscription_tiers is
  'Managed-SaaS subscription tiers. Tunable via Steward console without a deploy -- see docs in src/lib/subscription/enforcement.ts.';

-- The literal hard allowlist: which (model, task) combos a tier may call.
-- task = '*' means "any task"; a specific task (e.g. 'critic') lets a tier open
-- a cheaper/pricier model only for that task, so a subscriber's highest-leverage
-- calls (critic, rewrite) can use a better model than high-volume calls
-- (extraction, summarization) without paying flagship rates everywhere.
create table public.subscription_tier_models (
  tier_id text not null references public.subscription_tiers(id) on delete cascade,
  model text not null,
  task text not null default '*',
  created_at timestamptz not null default now(),
  primary key (tier_id, model, task)
);

alter table public.subscription_tiers enable row level security;
alter table public.subscription_tier_models enable row level security;

-- Tier catalog and allowlists are not user-secret data -- any authenticated
-- user can read them (needed to show "what's on my plan" / upgrade prompts in
-- the UI). Writes go through Steward routes only (service-role / requireStaff),
-- matching the account_deletion_requests precedent -- no client insert/update.
create policy "subscription tiers readable" on public.subscription_tiers
  for select using (auth.uid() is not null);

create policy "subscription tier models readable" on public.subscription_tier_models
  for select using (auth.uid() is not null);

-- security definer + stable so it's usable inside RLS policies and inside the
-- fail-closed application-layer gate alike, mirroring is_platform_staff() in
-- 202608180001_platform_staff_and_deletion_requests.sql.
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
  select coalesce(
    (select tier_id from public.user_subscriptions where user_id = p_user_id and status = 'active'),
    'starter'
  ) into v_tier_id;

  return exists (
    select 1
    from public.subscription_tier_models
    where tier_id = v_tier_id
      and model = p_model
      and (task = '*' or task = p_task)
  );
end;
$$;

grant execute on function public.is_model_allowed_for_user(uuid, text, text) to authenticated;

-- Seed the 4 tiers from the redone cost analysis (docs/pricing.md-style
-- research this session, live OpenRouter pricing).
insert into public.subscription_tiers (id, display_name, monthly_price_usd_cents, monthly_credit_cap_usd_micros, sort_order) values
  ('starter', 'Starter', 1500, 3600000, 1),
  ('pro', 'Pro', 3500, 18000000, 2),
  ('studio', 'Studio', 8900, 48000000, 3),
  ('publisher', 'Publisher', 19900, 180000000, 4);

-- Starter: DeepSeek V4 Pro only, every task.
insert into public.subscription_tier_models (tier_id, model, task) values
  ('starter', 'deepseek/deepseek-v4-pro', '*');

-- Pro: DeepSeek V4 Pro + Gemini 2.5 Flash + Claude Haiku 4.5, every task.
insert into public.subscription_tier_models (tier_id, model, task) values
  ('pro', 'deepseek/deepseek-v4-pro', '*'),
  ('pro', 'google/gemini-2.5-flash', '*'),
  ('pro', 'anthropic/claude-haiku-4.5', '*');

-- Studio: Pro's models, plus Opus 5 gated to critic + rewrite only (the
-- highest-leverage, quality-sensitive calls), Haiku for everything else
-- including high-volume extraction/summarization.
insert into public.subscription_tier_models (tier_id, model, task) values
  ('studio', 'deepseek/deepseek-v4-pro', '*'),
  ('studio', 'google/gemini-2.5-flash', '*'),
  ('studio', 'anthropic/claude-haiku-4.5', '*'),
  ('studio', 'anthropic/claude-opus-5', 'critic'),
  ('studio', 'anthropic/claude-opus-5', 'rewrite');

-- Publisher: identical model allowlist to Studio (differentiated by seats,
-- credit cap, and priority queue, not model access).
insert into public.subscription_tier_models (tier_id, model, task) values
  ('publisher', 'deepseek/deepseek-v4-pro', '*'),
  ('publisher', 'google/gemini-2.5-flash', '*'),
  ('publisher', 'anthropic/claude-haiku-4.5', '*'),
  ('publisher', 'anthropic/claude-opus-5', 'critic'),
  ('publisher', 'anthropic/claude-opus-5', 'rewrite');
