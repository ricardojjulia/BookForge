-- Safety migration: ensure freshness_events exists even if local migration history drifted

create table if not exists public.freshness_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  event_name text not null check (
    event_name in (
      'freshness_refresh_attempt',
      'freshness_refresh_success',
      'freshness_refresh_failed',
      'freshness_forced_refresh_triggered'
    )
  ),
  route_key text not null,
  status text not null check (status in ('fresh', 'stale', 'expired')),
  reason text check (reason in ('manual', 'forced')),
  age_ms bigint,
  stale_after_hours numeric,
  force_after_hours numeric,
  error text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists freshness_events_user_created_idx
  on public.freshness_events (user_id, created_at desc);

create index if not exists freshness_events_user_occurred_idx
  on public.freshness_events (user_id, occurred_at desc);

create index if not exists freshness_events_user_route_idx
  on public.freshness_events (user_id, route_key, occurred_at desc);

alter table public.freshness_events enable row level security;

drop policy if exists "freshness events select own" on public.freshness_events;
create policy "freshness events select own"
  on public.freshness_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "freshness events insert own" on public.freshness_events;
create policy "freshness events insert own"
  on public.freshness_events
  for insert
  with check (auth.uid() = user_id);

comment on table public.freshness_events is
  'Per-user refresh telemetry emitted by DataFreshnessBanner and used for analytics reliability summaries.';
