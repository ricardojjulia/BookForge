-- Freshness alerts + retention cleanup policy

create table if not exists public.freshness_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  route_key text not null,
  reason text not null check (reason in ('repeated_refresh_failures', 'forced_refresh_loop')),
  severity text not null check (severity in ('warning', 'critical')),
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists freshness_alerts_user_created_idx
  on public.freshness_alerts (user_id, created_at desc);

create index if not exists freshness_alerts_user_route_idx
  on public.freshness_alerts (user_id, route_key, created_at desc);

alter table public.freshness_alerts enable row level security;

drop policy if exists "freshness alerts select own" on public.freshness_alerts;
create policy "freshness alerts select own"
  on public.freshness_alerts
  for select
  using (auth.uid() = user_id);

drop policy if exists "freshness alerts insert own" on public.freshness_alerts;
create policy "freshness alerts insert own"
  on public.freshness_alerts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "freshness alerts update own" on public.freshness_alerts;
create policy "freshness alerts update own"
  on public.freshness_alerts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.cleanup_freshness_events(retention_days int default 90)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  if retention_days < 1 then
    raise exception 'retention_days must be >= 1';
  end if;

  delete from public.freshness_events
  where occurred_at < now() - make_interval(days => retention_days);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.cleanup_freshness_events(int) is
  'Deletes freshness_events older than retention_days and returns number of deleted rows.';

comment on table public.freshness_alerts is
  'Operational alerts generated from freshness telemetry failure patterns.';
