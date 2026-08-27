-- Allow the new managed-tier price-tuning pass (src/lib/subscription/
-- managed-price-tuning.ts) to log subscription_price decisions to the same
-- audit trail credit_cap/model_allowlist already use.
alter table public.pricing_adjustment_log drop constraint pricing_adjustment_log_field_check;
alter table public.pricing_adjustment_log add constraint pricing_adjustment_log_field_check
  check (field in ('credit_cap', 'model_allowlist', 'subscription_price'));

comment on column public.pricing_adjustment_log.field is
  'credit_cap: self_funded-tier-only, auto-applied (margin-tuning.ts) -- frozen for bookforge_managed tiers. model_allowlist: never auto-applied, human-actioned proposal, all funding models. subscription_price: bookforge_managed-tier-only, auto-applied, affects ONLY new signups going forward -- existing subscribers keep their locked-in Stripe price (managed-price-tuning.ts).';
