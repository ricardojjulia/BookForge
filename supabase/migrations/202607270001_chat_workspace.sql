-- Chat workspace foundation for per-book collaborative conversations.

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text,
  mode text not null default 'ask' check (mode in ('ask', 'edit', 'run', 'council')),
  context_policy jsonb not null default '{}'::jsonb,
  pinned_context jsonb not null default '{}'::jsonb,
  last_message_preview text,
  last_message_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  content_json jsonb not null default '{}'::jsonb,
  status text not null default 'completed' check (status in ('draft', 'streaming', 'completed', 'failed')),
  token_usage jsonb not null default '{}'::jsonb,
  model_info jsonb not null default '{}'::jsonb,
  parent_message_id uuid references public.chat_messages(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_tool_calls (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  tool_name text not null,
  tool_args jsonb not null default '{}'::jsonb,
  tool_result jsonb not null default '{}'::jsonb,
  job_id uuid references public.revision_jobs(id) on delete set null,
  status text not null default 'completed' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  retrieval_manifest jsonb not null default '{}'::jsonb,
  token_budget jsonb not null default '{}'::jsonb,
  source_hash text not null,
  created_at timestamptz not null default now(),
  unique (message_id)
);

create table if not exists public.chat_model_votes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  provider text not null,
  model text not null,
  candidate_text text not null,
  candidate_json jsonb not null default '{}'::jsonb,
  scorecard jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_syntheses (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  judge_provider text not null,
  judge_model text not null,
  rubric jsonb not null default '{}'::jsonb,
  winning_vote_ids uuid[] not null default '{}',
  synthesis_text text not null,
  synthesis_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_threads_book_updated_idx on public.chat_threads (book_id, updated_at desc);
create index if not exists chat_threads_created_by_updated_idx on public.chat_threads (created_by, updated_at desc);
create index if not exists chat_threads_book_last_message_idx on public.chat_threads (book_id, last_message_at desc nulls last);

create index if not exists chat_messages_thread_created_idx on public.chat_messages (thread_id, created_at);
create index if not exists chat_messages_book_created_idx on public.chat_messages (book_id, created_at desc);
create index if not exists chat_messages_parent_idx on public.chat_messages (parent_message_id);

create index if not exists chat_tool_calls_thread_created_idx on public.chat_tool_calls (thread_id, created_at);
create index if not exists chat_tool_calls_job_idx on public.chat_tool_calls (job_id);

create index if not exists chat_context_snapshots_thread_created_idx on public.chat_context_snapshots (thread_id, created_at desc);
create index if not exists chat_model_votes_message_created_idx on public.chat_model_votes (message_id, created_at);
create index if not exists chat_syntheses_message_idx on public.chat_syntheses (message_id);

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_tool_calls enable row level security;
alter table public.chat_context_snapshots enable row level security;
alter table public.chat_model_votes enable row level security;
alter table public.chat_syntheses enable row level security;

create policy "chat threads view" on public.chat_threads
  for select using (public.can_view_book(book_id));

create policy "chat threads create" on public.chat_threads
  for insert with check (public.can_edit_book(book_id) and created_by = auth.uid());

create policy "chat threads update" on public.chat_threads
  for update using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));

create policy "chat messages view" on public.chat_messages
  for select using (public.can_view_book(book_id));

create policy "chat messages insert" on public.chat_messages
  for insert with check (public.can_edit_book(book_id));

create policy "chat messages update" on public.chat_messages
  for update using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));

create policy "chat tool calls view" on public.chat_tool_calls
  for select using (
    exists (
      select 1
      from public.chat_threads t
      where t.id = chat_tool_calls.thread_id
        and public.can_view_book(t.book_id)
    )
  );

create policy "chat tool calls insert" on public.chat_tool_calls
  for insert with check (
    exists (
      select 1
      from public.chat_threads t
      where t.id = chat_tool_calls.thread_id
        and public.can_edit_book(t.book_id)
    )
  );

create policy "chat tool calls update" on public.chat_tool_calls
  for update using (
    exists (
      select 1
      from public.chat_threads t
      where t.id = chat_tool_calls.thread_id
        and public.can_edit_book(t.book_id)
    )
  )
  with check (
    exists (
      select 1
      from public.chat_threads t
      where t.id = chat_tool_calls.thread_id
        and public.can_edit_book(t.book_id)
    )
  );

create policy "chat context snapshots view" on public.chat_context_snapshots
  for select using (
    exists (
      select 1
      from public.chat_threads t
      where t.id = chat_context_snapshots.thread_id
        and public.can_view_book(t.book_id)
    )
  );

create policy "chat context snapshots insert" on public.chat_context_snapshots
  for insert with check (
    exists (
      select 1
      from public.chat_threads t
      where t.id = chat_context_snapshots.thread_id
        and public.can_edit_book(t.book_id)
    )
  );

create policy "chat model votes view" on public.chat_model_votes
  for select using (
    exists (
      select 1
      from public.chat_threads t
      where t.id = chat_model_votes.thread_id
        and public.can_view_book(t.book_id)
    )
  );

create policy "chat model votes insert" on public.chat_model_votes
  for insert with check (
    exists (
      select 1
      from public.chat_threads t
      where t.id = chat_model_votes.thread_id
        and public.can_edit_book(t.book_id)
    )
  );

create policy "chat syntheses view" on public.chat_syntheses
  for select using (
    exists (
      select 1
      from public.chat_threads t
      where t.id = chat_syntheses.thread_id
        and public.can_view_book(t.book_id)
    )
  );

create policy "chat syntheses insert" on public.chat_syntheses
  for insert with check (
    exists (
      select 1
      from public.chat_threads t
      where t.id = chat_syntheses.thread_id
        and public.can_edit_book(t.book_id)
    )
  );
