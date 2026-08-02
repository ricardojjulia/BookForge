-- Extends model_call_events (rather than adding a new table) to also carry
-- job-level health/trust signals: stale-job auto-detection incidents, and
-- estimated-vs-actual duration summaries for completed jobs. Per-call rows
-- keep event_type='model_call' (the existing default); job-level rows use
-- 'job_stale_detected' or 'job_completed_summary' and are attributable back
-- to the job via job_id.

alter table public.model_call_events
  add column job_id uuid references public.revision_jobs(id) on delete set null,
  add column event_type text not null default 'model_call',
  add column estimated_duration_ms int;

alter table public.model_call_events
  add constraint model_call_events_event_type_check
  check (event_type in ('model_call', 'job_stale_detected', 'job_completed_summary'));

create index model_call_events_job_id_idx on public.model_call_events (job_id);
create index model_call_events_event_type_created_idx
  on public.model_call_events (event_type, created_at desc);
