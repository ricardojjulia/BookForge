-- subscription_tiers.stripe_price_id keeps its existing meaning ("the price
-- new checkouts should use right now" -- src/app/api/billing/checkout/route.ts
-- reads it directly, unchanged) but is no longer the ONLY place a price id
-- can resolve to a tier: resolveTierIdForPrice (src/lib/billing/webhook-handlers.ts)
-- must also resolve an OLD price id that a still-active subscriber's webhook
-- events keep citing after a price rotation (see src/lib/subscription/
-- managed-price-tuning.ts). Without this, rotating a tier's price would break
-- every existing subscriber's webhook processing the next time Stripe sends
-- any subscription-object event citing their (no-longer-current) price id.
create table public.tier_stripe_prices (
  id uuid primary key default gen_random_uuid(),
  tier_id text not null references public.subscription_tiers(id) on delete cascade,
  stripe_price_id text not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index tier_stripe_prices_price_id_idx on public.tier_stripe_prices (stripe_price_id);
-- At most one "current" row per tier.
create unique index tier_stripe_prices_one_current_idx on public.tier_stripe_prices (tier_id) where is_current;
create index tier_stripe_prices_tier_idx on public.tier_stripe_prices (tier_id, created_at desc);

-- Backfill whatever stripe_price_id values are already live in this
-- environment (they're set via one-off UPDATEs per 202608200009's
-- convention, so this migration can't know literal values -- it backfills
-- from the column's current state at migration time).
insert into public.tier_stripe_prices (tier_id, stripe_price_id, is_current)
select id, stripe_price_id, true
from public.subscription_tiers
where stripe_price_id is not null
on conflict (stripe_price_id) do nothing;

alter table public.tier_stripe_prices enable row level security;
-- No policies -- service-role only (webhook route + price-tuning job), same
-- posture as pricing_adjustment_log.

-- Atomic rotation helper -- the ONLY sanctioned way to change a tier's
-- current Stripe price going forward (supersedes the raw one-off UPDATE
-- described in 202608200009_stripe_billing.sql's comment: any future manual
-- price fix must go through this function, not a raw UPDATE, or the new
-- price silently won't be in tier_stripe_prices and a later rotation away
-- from it has no history to fall back to for that specific transition).
create or replace function public.set_tier_current_stripe_price(p_tier_id text, p_new_stripe_price_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- IS DISTINCT FROM (not <>) deliberately -- a plain <> against a NULL
  -- auth.role() (no role claim present) evaluates to NULL, not TRUE, which
  -- Postgres treats as "don't raise" in an IF, silently allowing the call.
  -- Same class of bug fixed in get_openrouter_management_key (202608260001).
  if auth.role() is distinct from 'service_role' then
    raise exception 'Not authorized.';
  end if;

  update public.tier_stripe_prices set is_current = false where tier_id = p_tier_id and is_current;
  insert into public.tier_stripe_prices (tier_id, stripe_price_id, is_current)
    values (p_tier_id, p_new_stripe_price_id, true);
  update public.subscription_tiers
    set stripe_price_id = p_new_stripe_price_id, updated_at = now()
    where id = p_tier_id;
end;
$$;

grant execute on function public.set_tier_current_stripe_price(text, text) to service_role;
