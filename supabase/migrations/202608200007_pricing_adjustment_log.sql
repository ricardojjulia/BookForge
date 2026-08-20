-- Audit trail for the autonomous margin-tuning job (src/lib/subscription/margin-tuning.ts).
-- Every run writes a row per tier it evaluated, whether or not it actually changed
-- anything -- 'blocked' rows (circuit breaker tripped) and 'proposed' rows (a
-- change identified but not auto-applied -- see field's comment below) are exactly
-- as important to see on the Steward dashboard as 'applied' ones.
create table public.pricing_adjustment_log (
  id uuid primary key default gen_random_uuid(),
  tier_id text not null references public.subscription_tiers(id) on delete cascade,
  -- 'credit_cap' changes are auto-applied within a bounded step: a tier's cap is
  -- only ever read into a user's balance at grant time (signup, or a future
  -- period-reset), never live, so retuning the tier row can't silently change what
  -- an existing subscriber gets mid-cycle -- see reserve_ai_credits/grant_tier_credits.
  -- 'model_allowlist' changes are deliberately never auto-applied: is_model_allowed_for_user()
  -- is a live, unversioned lookup against subscription_tier_models, so unlike the
  -- credit cap there is no mechanism today that defers an allowlist change to an
  -- existing subscriber's next period -- applying one immediately would be exactly
  -- the "entitlement changes underneath an active subscriber" failure the whole
  -- design exists to avoid. These rows are always status='proposed', for a human to
  -- act on via the Steward console.
  field text not null check (field in ('credit_cap', 'model_allowlist')),
  old_value text,
  new_value text,
  trigger_metric jsonb not null,
  status text not null check (status in ('applied', 'blocked', 'proposed')),
  effective_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index pricing_adjustment_log_tier_created_idx on public.pricing_adjustment_log (tier_id, created_at desc);

alter table public.pricing_adjustment_log enable row level security;
-- No policies for authenticated/anon -- service-role (the tuning job) + Steward
-- routes (requireStaff + admin client) only, mirroring account_deletion_requests.
