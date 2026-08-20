-- Per-user tier assignment. Unlike user_settings' bypassable direct client
-- upsert, tier assignment must only ever be writable by service-role/Steward
-- routes -- own-row select only, no client insert/update/delete.
create table public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier_id text not null default 'starter' references public.subscription_tiers(id),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  -- Reserved, unwired -- avoids a second migration when billing lands.
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_subscriptions enable row level security;

create policy "user subscriptions own select" on public.user_subscriptions
  for select using (user_id = (select auth.uid()));

-- No insert/update/delete policy at all: rows are only ever written by a
-- service-role client (billing webhook, once it exists) or a Steward route
-- via requireStaff() -- never directly by the subscriber.
