-- Real token/cost telemetry, extending the existing table rather than a new
-- one (cost is 1:1 with an existing call event) -- same pattern as
-- 202608020001_job_health_events.sql's event_type/job_id extension.
alter table public.model_call_events
  add column prompt_tokens integer,
  add column completion_tokens integer,
  add column cost_usd_micros bigint,
  -- Snapshot at call time, not a live join -- a user's tier can change later
  -- and history should reflect what was actually true then.
  add column tier_id text;

create index model_call_events_tier_created_idx
  on public.model_call_events (tier_id, created_at desc);
