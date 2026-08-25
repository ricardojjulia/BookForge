-- Closes two real trial-abuse gaps: (1) delete-and-resignup with the same
-- email resets the $3.60 trial cap indefinitely, since nothing tracked
-- that an email had already had a trial once its account was purged; (2)
-- disposable/temp-mail domains let one person mint unlimited trial
-- accounts trivially. See [[project_signup_abuse_mitigation]] for why the
-- $ exposure per account was already judged small and bounded -- this
-- closes the *volume* gap the same way hCaptcha does, one layer further.

-- The HMAC key itself is deliberately NOT in this migration file -- this
-- repo is public. It's created separately via a one-off
-- `select vault.create_secret(...)` the operator runs directly, keyed by
-- the well-known name below. A keyed hash (not a bare SHA-256) matters
-- specifically because email address space is small enough to
-- rainbow-table/brute-force a bare hash back to the original address --
-- the key is what keeps this from just being a weaker plaintext column if
-- this table (or a backup of it) ever leaked.
create table public.trial_grant_ledger (
  email_hash text primary key,
  first_granted_at timestamptz not null default now()
);
alter table public.trial_grant_ledger enable row level security;
-- No policies for authenticated/anon: service-role/trigger only, same
-- pattern as account_deletion_requests.

-- Returns NULL (not an exception) when the key isn't configured, so a
-- self-hosted `supabase start` -- which has no reason to run this
-- managed-SaaS-only abuse check and no documented setup step for it, see
-- docs/SELF_HOSTING.md -- degrades to "can't verify, don't block" rather
-- than every signup failing outright with an opaque Vault error.
create or replace function public.hash_trial_email(p_email text)
returns text
language plpgsql
security definer
stable
set search_path = public, extensions, vault
as $$
declare
  hmac_key text;
begin
  select decrypted_secret into hmac_key
  from vault.decrypted_secrets
  where name = 'trial_email_hash_key';

  if hmac_key is null then
    return null;
  end if;

  return encode(extensions.hmac(lower(trim(p_email)), hmac_key, 'sha256'), 'hex');
end;
$$;

-- A small, well-known set of disposable/temp-mail providers -- deliberately
-- narrow (see [[project_signup_abuse_mitigation]]: start with the cheap,
-- high-signal measure rather than a heavier fraud-list integration nothing
-- yet justifies). Easy to extend with more rows later; no code change
-- needed to add a domain.
create table public.disposable_email_domains (
  domain text primary key
);
alter table public.disposable_email_domains enable row level security;

insert into public.disposable_email_domains (domain) values
  ('mailinator.com'), ('10minutemail.com'), ('10minutemail.net'),
  ('guerrillamail.com'), ('guerrillamail.info'), ('guerrillamail.biz'),
  ('guerrillamail.de'), ('guerrillamail.org'), ('guerrillamailblock.com'),
  ('tempmail.com'), ('temp-mail.org'), ('tempmailo.com'),
  ('throwawaymail.com'), ('yopmail.com'), ('yopmail.fr'), ('yopmail.net'),
  ('trashmail.com'), ('trashmail.net'), ('getnada.com'), ('maildrop.cc'),
  ('mailnesia.com'), ('mintemail.com'), ('mohmal.com'),
  ('fakeinbox.com'), ('sharklasers.com'), ('spam4.me'),
  ('discard.email'), ('discardmail.com'), ('emailondeck.com'),
  ('dispostable.com'), ('mailcatch.com'), ('moakt.com'), ('inboxbear.com'),
  ('crazymailing.com'), ('burnermail.io'), ('33mail.com'),
  ('mytemp.email');

-- BEFORE INSERT so a match aborts account creation outright -- the client
-- signUp() call fails with this message, no account is ever created,
-- nothing for the ledger below to even need to consider.
create or replace function public.reject_disposable_email_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.disposable_email_domains
    where domain = lower(split_part(new.email, '@', 2))
  ) then
    raise exception 'Disposable email addresses are not allowed for signup.';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_disposable_email_signup_trigger on auth.users;
create trigger reject_disposable_email_signup_trigger
  before insert on auth.users
  for each row execute function public.reject_disposable_email_signup();

-- Replaces the trial-grant trigger from 202608220001_trial_subscriptions.sql:
-- same unconditional 14-day trial for a first-time email, but an email
-- that's already drawn a trial before (found via the ledger, survives even
-- past account deletion since account_deletion_requests snapshots the
-- email separately and the auth.users row itself gets purged) now gets
-- 'incomplete' with no trial_ends_at instead -- get_user_subscription_tier()
-- already resolves that to "no access" until they actually pay, the exact
-- same state a real post-checkout-abandonment signup lands in.
create or replace function public.handle_new_user_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_hash text;
  v_already_granted boolean := false;
begin
  v_email_hash := public.hash_trial_email(new.email);

  if v_email_hash is not null then
    select exists (
      select 1 from public.trial_grant_ledger where email_hash = v_email_hash
    ) into v_already_granted;
  end if;

  if v_already_granted then
    insert into public.user_subscriptions (user_id, tier_id, status, trial_ends_at)
    values (new.id, 'starter', 'incomplete', null)
    on conflict (user_id) do nothing;
  else
    if v_email_hash is not null then
      insert into public.trial_grant_ledger (email_hash) values (v_email_hash)
        on conflict (email_hash) do nothing;
    end if;
    insert into public.user_subscriptions (user_id, tier_id, status, trial_ends_at)
    values (new.id, 'starter', 'trialing', now() + interval '14 days')
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;
