-- Credit ledger: the money chokepoint. A single mutable running-total
-- balance (not "sum the ledger on every check") -- the hot path can be
-- checked up to ~306 times in a single rewrite job.
create table public.user_credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_usd_micros bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Append-only audit trail. balance_after_usd_micros is a point-in-time
-- snapshot so margin queries never need to replay the ledger.
create table public.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.revision_jobs(id) on delete set null,
  model text,
  task text,
  kind text not null check (kind in ('reservation', 'reconciliation', 'refund', 'grant', 'period_reset', 'auto_tune_adjustment')),
  amount_usd_micros bigint not null,
  balance_after_usd_micros bigint not null,
  model_call_event_id uuid references public.model_call_events(id) on delete set null,
  created_at timestamptz not null default now()
);

create index ai_credit_ledger_user_created_idx on public.ai_credit_ledger (user_id, created_at desc);

alter table public.user_credit_balances enable row level security;
alter table public.ai_credit_ledger enable row level security;

-- Own-row select only. All writes go through the security definer RPCs
-- below -- no client insert/update/delete, same discipline as
-- user_subscriptions.
create policy "user credit balances own select" on public.user_credit_balances
  for select using (user_id = (select auth.uid()));

create policy "ai credit ledger own select" on public.ai_credit_ledger
  for select using (user_id = (select auth.uid()));

-- Sets (not adds to) a user's balance to their current tier's monthly cap,
-- recording a ledger entry. Used for a fresh signup grant and, later, a
-- billing-cycle period reset -- credits don't roll over month to month,
-- consistent with the tier cost analysis's margin assumptions.
create or replace function public.grant_tier_credits(p_user_id uuid, p_kind text default 'grant')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier_id text;
  v_cap bigint;
begin
  if p_kind not in ('grant', 'period_reset') then
    raise exception 'grant_tier_credits: invalid kind %', p_kind;
  end if;

  v_tier_id := public.get_user_subscription_tier(p_user_id);
  select monthly_credit_cap_usd_micros into v_cap from public.subscription_tiers where id = v_tier_id;
  if v_cap is null then
    raise exception 'grant_tier_credits: unknown tier %', v_tier_id;
  end if;

  insert into public.user_credit_balances (user_id, balance_usd_micros)
  values (p_user_id, v_cap)
  on conflict (user_id) do update set balance_usd_micros = v_cap, updated_at = now();

  insert into public.ai_credit_ledger (user_id, kind, amount_usd_micros, balance_after_usd_micros)
  values (p_user_id, p_kind, v_cap, v_cap);

  return v_cap;
end;
$$;

grant execute on function public.grant_tier_credits(uuid, text) to authenticated;

-- The atomic debit. A single conditional UPDATE ... WHERE balance >= amount
-- is self-atomic under Postgres MVCC: concurrent calls for the same user
-- serialize on the row, and the second evaluates its WHERE clause against
-- the already-decremented value -- overdraw is structurally impossible.
--
-- Lazily provisions a first-use balance at the user's tier cap (mirrors
-- is_model_allowed_for_user's default-to-starter -- a brand-new user's very
-- first call must not fail purely because no billing flow has run yet).
create or replace function public.reserve_ai_credits(
  p_user_id uuid,
  p_amount_usd_micros bigint,
  p_model text,
  p_task text,
  p_job_id uuid default null
)
returns table (reservation_id uuid, balance_after_usd_micros bigint)
language plpgsql
security definer
as $$
declare
  v_new_balance bigint;
  v_reservation_id uuid;
begin
  if not exists (select 1 from public.user_credit_balances where user_id = p_user_id) then
    perform public.grant_tier_credits(p_user_id, 'grant');
  end if;

  update public.user_credit_balances
  set balance_usd_micros = balance_usd_micros - p_amount_usd_micros, updated_at = now()
  where user_id = p_user_id and balance_usd_micros >= p_amount_usd_micros
  returning balance_usd_micros into v_new_balance;

  if not found then
    raise exception 'Insufficient credits.' using errcode = 'P0001';
  end if;

  insert into public.ai_credit_ledger (user_id, job_id, model, task, kind, amount_usd_micros, balance_after_usd_micros)
  values (p_user_id, p_job_id, p_model, p_task, 'reservation', -p_amount_usd_micros, v_new_balance)
  returning id into v_reservation_id;

  return query select v_reservation_id, v_new_balance;
end;
$$;

grant execute on function public.reserve_ai_credits(uuid, bigint, text, text, uuid) to authenticated;

-- True-up once real completion.usage is known. Only ever refunds the
-- pessimistic-estimate overcharge back into the balance (actual usage
-- should never exceed the max_tokens-based reservation, but the LEAST()
-- guard means a refund can't go negative even if it somehow did).
create or replace function public.reconcile_ai_credit_reservation(
  p_reservation_id uuid,
  p_actual_amount_usd_micros bigint,
  p_model_call_event_id uuid default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_reserved_amount bigint;
  v_refund bigint;
  v_new_balance bigint;
begin
  select user_id, -amount_usd_micros into v_user_id, v_reserved_amount
  from public.ai_credit_ledger
  where id = p_reservation_id and kind = 'reservation';

  if not found then
    raise exception 'reconcile_ai_credit_reservation: unknown reservation %', p_reservation_id;
  end if;

  v_refund := greatest(0, least(v_reserved_amount, v_reserved_amount - p_actual_amount_usd_micros));
  if v_refund = 0 then
    return;
  end if;

  update public.user_credit_balances
  set balance_usd_micros = balance_usd_micros + v_refund, updated_at = now()
  where user_id = v_user_id
  returning balance_usd_micros into v_new_balance;

  insert into public.ai_credit_ledger (user_id, kind, amount_usd_micros, balance_after_usd_micros, model_call_event_id)
  values (v_user_id, 'reconciliation', v_refund, v_new_balance, p_model_call_event_id);
end;
$$;

grant execute on function public.reconcile_ai_credit_reservation(uuid, bigint, uuid) to authenticated;
