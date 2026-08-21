-- Fix: user_subscriptions previously defaulted status to 'active' the moment
-- a Stripe customer row was created at checkout time (before payment
-- completes) -- checkout/route.ts's upsert only sets user_id/stripe_customer_id
-- and relied on column defaults for the rest. That silently granted real
-- starter-tier model access (is_model_allowed_for_user matches status='active')
-- to anyone who merely clicked "Subscribe", and permanently blocked them from
-- ever checking out again (checkout/route.ts refuses re-entry once status is
-- 'active'). 'incomplete' represents "Stripe customer exists, no completed
-- subscription yet" and is never treated as active by any consumer.
alter table public.user_subscriptions drop constraint user_subscriptions_status_check;
alter table public.user_subscriptions add constraint user_subscriptions_status_check
  check (status in ('incomplete', 'active', 'past_due', 'canceled'));
alter table public.user_subscriptions alter column status set default 'incomplete';
