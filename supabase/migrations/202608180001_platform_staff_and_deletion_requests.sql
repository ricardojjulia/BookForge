-- Account deletion tracking (ban-based soft delete, see account/delete route) and a
-- platform-wide staff role ("Steward" in the UI; kept generic here in the schema).

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately no FK to auth.users: if this cascaded, the purge itself would delete
  -- the audit row it exists to preserve. email/display_name are snapshotted below
  -- because both source rows are gone once the account is actually purged.
  user_id uuid not null,
  email_at_request text,
  display_name_at_request text,
  requested_at timestamptz not null default now(),
  purge_after timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'ready_for_purge', 'purged', 'restored', 'cancelled')),
  restored_at timestamptz,
  restored_by uuid,
  purged_at timestamptz,
  purge_error text
);

create unique index account_deletion_requests_active_user_idx
  on public.account_deletion_requests (user_id)
  where status in ('pending', 'ready_for_purge');

create index account_deletion_requests_purge_after_idx
  on public.account_deletion_requests (purge_after)
  where status = 'pending';

alter table public.account_deletion_requests enable row level security;
-- No policies for authenticated/anon: this table is service-role + Steward-route only.

alter table public.profiles
  add column platform_role text check (platform_role in ('steward'));

create or replace function public.is_platform_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and platform_role = 'steward'
  );
$$;
