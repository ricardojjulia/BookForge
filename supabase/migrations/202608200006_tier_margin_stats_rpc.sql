-- Per-tier daily margin rollup, mirroring model_call_daily_stats' aggregate-in-SQL
-- approach (202608030001) rather than pulling raw rows into JS. Unlike that
-- self-service RPC, this returns cross-user business data, so it authorizes via
-- is_platform_staff() inside the function body -- the calling Steward route also
-- calls requireStaff() (defense in depth, same reasoning as requireStaff's own
-- doc comment: a layout-only check doesn't gate a direct API hit). Also allows
-- auth.role() = 'service_role': the margin-tuning cron job (margin-tuning.ts)
-- calls this RPC via a service-role client that has no auth.uid() at all --
-- is_platform_staff() would always read as false for it, not just "not staff".
create or replace function public.tier_margin_daily_stats(p_days integer default 30)
returns table (
  day date,
  tier_id text,
  active_users bigint,
  call_count bigint,
  total_cost_usd_micros bigint,
  avg_cost_per_user_usd_micros bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not (public.is_platform_staff() or auth.role() = 'service_role') then
    raise exception 'Not authorized to read this data.';
  end if;

  return query
  select
    (m.created_at at time zone 'utc')::date as day,
    m.tier_id,
    count(distinct m.user_id) as active_users,
    count(*) as call_count,
    sum(coalesce(m.cost_usd_micros, 0))::bigint as total_cost_usd_micros,
    round(sum(coalesce(m.cost_usd_micros, 0))::numeric / nullif(count(distinct m.user_id), 0))::bigint as avg_cost_per_user_usd_micros
  from public.model_call_events m
  where m.event_type = 'model_call'
    and m.tier_id is not null
    and m.created_at >= (now() - (p_days || ' days')::interval)
  group by day, m.tier_id
  order by day desc, m.tier_id;
end;
$$;

grant execute on function public.tier_margin_daily_stats(integer) to authenticated;
grant execute on function public.tier_margin_daily_stats(integer) to service_role;
