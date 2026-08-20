-- Real Stripe billing behind the managed-SaaS subscription-tier system.
-- Price IDs are Stripe-account-specific (and differ between test/live mode),
-- so they're deliberately NOT seeded here -- set them via a one-off
-- `update subscription_tiers set stripe_price_id = '...' where id = '...'`
-- after creating the matching Products/Prices in the Stripe Dashboard.
alter table public.subscription_tiers
  add column stripe_price_id text;

create unique index subscription_tiers_stripe_price_id_idx
  on public.subscription_tiers (stripe_price_id)
  where stripe_price_id is not null;

-- Idempotency guard for the webhook handler: Stripe retries undelivered/
-- unacknowledged events, and a duplicate delivery of checkout.session.completed
-- or invoice.paid must not double-grant credits. Service-role only, no RLS
-- policies for authenticated/anon -- mirrors account_deletion_requests /
-- pricing_adjustment_log.
create table public.stripe_webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
