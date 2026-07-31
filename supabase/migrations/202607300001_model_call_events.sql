-- Per-call empirical record of LM Studio model behavior (success/failure/context
-- used), so model selection can learn from what actually happened on this
-- machine instead of relying purely on static name-based heuristics.

create table public.model_call_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  model text not null,
  task text not null,
  context_length int not null,
  outcome text not null check (outcome in ('success', 'empty_completion', 'underlength', 'context_error', 'error')),
  error_signature text,
  word_count int,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index model_call_events_model_task_created_idx
  on public.model_call_events (model, task, created_at desc);

create index model_call_events_user_id_idx
  on public.model_call_events (user_id);

alter table public.model_call_events enable row level security;

drop policy if exists "model call events own" on public.model_call_events;
create policy "model call events own" on public.model_call_events
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
