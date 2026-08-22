-- Closes a real free-access hole: get_user_subscription_tier() and
-- is_model_allowed_for_user() both defaulted ANY user with no
-- user_subscriptions row to the 'starter' tier, and reserve_ai_credits()
-- auto-grants real spendable credits on first use via grant_tier_credits().
-- Net effect: every signed-up user got real, metered AI access forever,
-- with zero payment and zero trial tracking -- discovered because nothing
-- in the product ever told the user they were on any kind of trial or
-- asked them to choose a plan.
--
-- Fix: give every user a real, time-boxed trial instead of an unbounded
-- free ride. New signups get one automatically (trigger below); existing
-- users are backfilled the same way so nobody's access silently breaks.

alter table public.user_subscriptions
  drop constraint user_subscriptions_status_check;
alter table public.user_subscriptions
  add constraint user_subscriptions_status_check
  check (status in ('trialing', 'incomplete', 'active', 'past_due', 'canceled'));

alter table public.user_subscriptions
  add column trial_ends_at timestamptz;

-- Backfill: anyone who already signed up (in any environment this migration
-- runs against) but has no subscription row yet gets a trial starting now,
-- rather than losing access the moment the coalesce-to-starter fallback
-- below is removed.
insert into public.user_subscriptions (user_id, tier_id, status, trial_ends_at)
select u.id, 'starter', 'trialing', now() + interval '14 days'
from auth.users u
where not exists (select 1 from public.user_subscriptions s where s.user_id = u.id);

-- Standard Supabase pattern: a trigger on auth.users so the trial starts
-- exactly at signup regardless of which client-side flow the user takes
-- (can't be skipped by closing the browser mid-onboarding).
create or replace function public.handle_new_user_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_subscriptions (user_id, tier_id, status, trial_ends_at)
  values (new.id, 'starter', 'trialing', now() + interval '14 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_trial on auth.users;
create trigger on_auth_user_created_trial
  after insert on auth.users
  for each row execute function public.handle_new_user_trial();

-- A trialing user counts as their tier only while trial_ends_at is still in
-- the future; an expired, never-converted trial now resolves to NULL (no
-- tier) instead of silently falling back to 'starter' forever.
create or replace function public.get_user_subscription_tier(p_user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select tier_id from public.user_subscriptions
  where user_id = p_user_id
    and (status = 'active' or (status = 'trialing' and trial_ends_at > now()))
  limit 1;
$$;

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
  if v_tier_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.subscription_tier_models
    where tier_id = v_tier_id
      and model = p_model
      and (task = '*' or task = p_task)
  );
end;
$$;
