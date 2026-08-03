-- Analytics had zero visibility into raw model_call_events -- the only
-- queries against that table filtered for job_stale_detected and
-- job_completed_summary event types, never the model_call events
-- themselves. There was no way to see call volume, latency, or success-rate
-- trends over time from the UI, even though that's exactly the data users
-- need to tell "we're just testing hard today" apart from "something is
-- actually degrading." Pulling thousands of raw rows per day into the page
-- to compute this in JS doesn't scale, so this does the aggregation in SQL.

create or replace function public.model_call_daily_stats(p_user_id uuid, p_days integer default 14)
returns table (
  day date,
  call_count bigint,
  success_count bigint,
  avg_duration_ms numeric,
  p50_duration_ms numeric,
  p95_duration_ms numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized to read this data.';
  end if;

  return query
  select
    (m.created_at at time zone 'utc')::date as day,
    count(*) as call_count,
    count(*) filter (where m.outcome = 'success') as success_count,
    round(avg(m.duration_ms)) as avg_duration_ms,
    round(percentile_cont(0.5) within group (order by m.duration_ms)) as p50_duration_ms,
    round(percentile_cont(0.95) within group (order by m.duration_ms)) as p95_duration_ms
  from public.model_call_events m
  where m.user_id = p_user_id
    and m.event_type = 'model_call'
    and m.created_at >= (now() - (p_days || ' days')::interval)
  group by day
  order by day desc;
end;
$$;

grant execute on function public.model_call_daily_stats(uuid, integer) to authenticated;

create or replace function public.model_call_stats_by_model(p_user_id uuid, p_days integer default 14)
returns table (
  model text,
  call_count bigint,
  success_count bigint,
  avg_duration_ms numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized to read this data.';
  end if;

  return query
  select
    m.model,
    count(*) as call_count,
    count(*) filter (where m.outcome = 'success') as success_count,
    round(avg(m.duration_ms)) as avg_duration_ms
  from public.model_call_events m
  where m.user_id = p_user_id
    and m.event_type = 'model_call'
    and m.created_at >= (now() - (p_days || ' days')::interval)
  group by m.model
  order by call_count desc;
end;
$$;

grant execute on function public.model_call_stats_by_model(uuid, integer) to authenticated;
