-- Goodwill bonus: actually grant 20% more than a tier's advertised/priced
-- cap. subscription_tiers.monthly_credit_cap_usd_micros itself stays
-- untouched (that's the priced/advertised number) -- only what's actually
-- spendable changes. Applies to the internal ledger here; the equivalent
-- bonus for an OpenRouter-managed scoped key's `limit` is computed by
-- TIER_CREDIT_BONUS_MULTIPLIER in src/lib/openrouter/management.ts -- keep
-- both in sync by hand, Postgres and TypeScript can't share one literal.
--
-- Confirmed via grep that grant_tier_credits() is the only reader of
-- monthly_credit_cap_usd_micros, so this is a safe, single-point change with
-- no margin-analytics distortion (margin-tuning.ts adjusts the tier's priced
-- cap for cost-recovery purposes; this multiplier is layered on top of
-- whatever that cap currently is, at the moment of granting).

create or replace function public.grant_tier_credits(p_user_id uuid, p_kind text default 'grant')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier_id text;
  v_tier_cap_usd_micros bigint;
  v_bonus_multiplier constant numeric := 1.20;
  v_granted_usd_micros bigint;
begin
  if p_kind not in ('grant', 'period_reset') then
    raise exception 'grant_tier_credits: invalid kind %', p_kind;
  end if;

  v_tier_id := public.get_user_subscription_tier(p_user_id);
  select monthly_credit_cap_usd_micros into v_tier_cap_usd_micros from public.subscription_tiers where id = v_tier_id;
  if v_tier_cap_usd_micros is null then
    raise exception 'grant_tier_credits: unknown tier %', v_tier_id;
  end if;

  v_granted_usd_micros := round(v_tier_cap_usd_micros * v_bonus_multiplier)::bigint;

  insert into public.user_credit_balances (user_id, balance_usd_micros)
  values (p_user_id, v_granted_usd_micros)
  on conflict (user_id) do update set balance_usd_micros = v_granted_usd_micros, updated_at = now();

  insert into public.ai_credit_ledger (user_id, kind, amount_usd_micros, balance_after_usd_micros)
  values (p_user_id, p_kind, v_granted_usd_micros, v_granted_usd_micros);

  return v_granted_usd_micros;
end;
$$;
