-- BookForge-Managed OpenRouter tier family: a subscription tier can now be
-- "self_funded" (today's default -- the user brings their own key/OpenRouter
-- account, per 202608260001/202608260002) or "bookforge_managed" (BookForge's
-- own OpenRouter master account funds and mints the user's scoped key, no
-- key of any kind requested from the user). See
-- src/lib/openrouter/management.ts's resolveOpenRouterManagementKey() and
-- src/app/api/onboarding/openrouter-bookforge-managed/route.ts.

alter table public.subscription_tiers
  add column funding_model text not null default 'self_funded'
  check (funding_model in ('self_funded', 'bookforge_managed'));
-- existing 4 rows (starter/pro/studio/publisher) get 'self_funded' via the
-- DEFAULT -- metadata-only change, no table rewrite.

comment on column public.subscription_tiers.funding_model is
  'self_funded: user brings their own provider key/account. bookforge_managed: BookForge''s own OpenRouter master account funds and mints the user''s scoped key -- see OPENROUTER_MASTER_MANAGEMENT_KEY.';

-- The user's vendor-restriction PREFERENCE -- only meaningful on a
-- bookforge_managed tier, harmlessly ignored otherwise. Deliberately no
-- fixed-enum check constraint: the allowed vendor set is catalog-driven
-- (whatever subscription_tier_models actually contains for this user's
-- tier) and changes without a deploy; a stale/invalid value here just
-- yields zero matching models via is_model_allowed_for_user below -- a
-- safe fail-closed outcome, not a security one.
alter table public.user_settings add column if not exists openrouter_vendor_lock text;

comment on column public.user_settings.openrouter_vendor_lock is
  'Optional vendor prefix (e.g. "openai", "anthropic", "google") restricting which OpenRouter-catalog models a bookforge_managed user may call. NULL means "balance across every vendor available on the tier". Ignored for self_funded users.';

-- Which account the user's CURRENTLY ACTIVE scoped key (openrouter_scoped_key_hash)
-- was minted on. This is NOT the same thing as the user's current tier's
-- funding_model -- a key lives permanently on whichever account created it;
-- tier funding_model can change out from under it on upgrade/downgrade, and
-- the two must be compared, not conflated, when deciding whether to resize
-- or disable a key. See resolveOpenRouterManagementKey() in management.ts.
alter table public.user_settings add column if not exists openrouter_scoped_key_funding_model text
  check (openrouter_scoped_key_funding_model is null
         or openrouter_scoped_key_funding_model in ('self_funded', 'bookforge_managed'));

comment on column public.user_settings.openrouter_scoped_key_funding_model is
  'Which account minted this user''s CURRENT openrouter_scoped_key_hash -- self_funded (their own account) or bookforge_managed (BookForge''s master account). Tracked separately from the user''s live tier because a key cannot change which account it lives on; a funding-model mismatch on renewal/upgrade means the key must be disabled and re-minted via re-onboarding, not resized.';

-- Backfill: every scoped key that exists today (PR #199, pre-dates this
-- migration) was necessarily minted on the user's own account via BYOT.
update public.user_settings set openrouter_scoped_key_funding_model = 'self_funded'
  where openrouter_scoped_key_hash is not null;

-- Extend the ONE existing model-allowlist choke point to also apply a
-- vendor lock when the user's tier is bookforge_managed. Same signature --
-- src/lib/subscription/enforcement.ts's assertModelAllowedForUser needs no
-- changes.
create or replace function public.is_model_allowed_for_user(p_user_id uuid, p_model text, p_task text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tier_id text;
  v_vendor_lock text;
begin
  select coalesce(
    (select tier_id from public.user_subscriptions where user_id = p_user_id and status = 'active'),
    'starter'
  ) into v_tier_id;

  -- Vendor lock only ever applies on a bookforge_managed tier -- a
  -- self_funded user's provider/model choice is already constrained by
  -- which provider+key they configured at onboarding, so there's nothing
  -- to layer here.
  if exists (select 1 from public.subscription_tiers where id = v_tier_id and funding_model = 'bookforge_managed') then
    select openrouter_vendor_lock into v_vendor_lock
    from public.user_settings where user_id = p_user_id;
  end if;

  return exists (
    select 1
    from public.subscription_tier_models
    where tier_id = v_tier_id
      and model = p_model
      and (task = '*' or task = p_task)
  )
  and (v_vendor_lock is null or v_vendor_lock = '' or p_model like v_vendor_lock || '/%');
end;
$$;
