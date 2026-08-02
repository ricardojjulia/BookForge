create table if not exists public.creativewriter_sync_projects (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  account_id uuid references auth.users(id) on delete cascade not null,
  local_project_id text not null,
  sync_cursor text,
  last_cloud_version bigint not null default 0,
  device_label text,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(book_id, account_id, local_project_id)
);

create table if not exists public.creativewriter_sync_events (
  id uuid primary key default gen_random_uuid(),
  sync_project_id uuid references public.creativewriter_sync_projects(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade not null,
  account_id uuid references auth.users(id) on delete cascade not null,
  local_change_id text,
  idempotency_key text not null,
  conflict_id text,
  entity_type text not null check (entity_type in ('book', 'chapter', 'scene', 'paragraph', 'note', 'research', 'bible', 'metadata', 'revision', 'comment')),
  entity_id text not null,
  operation text not null check (operation in ('create', 'update', 'delete', 'reorder', 'accept_revision', 'reject_revision', 'metadata_update')),
  base_version bigint not null default 0,
  local_version bigint not null default 0,
  cloud_version bigint not null default 0,
  status text not null check (status in ('applied', 'conflict', 'rejected')),
  payload jsonb not null default '{}',
  conflict_payload jsonb,
  rejection_reason text,
  resolution_status text not null default 'unresolved'
    check (resolution_status in ('unresolved', 'resolved_local', 'resolved_cloud', 'resolved_manual')),
  resolved_payload jsonb,
  resolution_note text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(book_id, account_id, idempotency_key)
);

alter table public.creativewriter_sync_projects enable row level security;
alter table public.creativewriter_sync_events enable row level security;

create policy "creativewriter sync projects view"
  on public.creativewriter_sync_projects for select
  using (account_id = (select auth.uid()) and public.can_view_book(book_id));

create policy "creativewriter sync projects insert"
  on public.creativewriter_sync_projects for insert
  with check (account_id = (select auth.uid()) and public.can_edit_book(book_id));

create policy "creativewriter sync projects update"
  on public.creativewriter_sync_projects for update
  using (account_id = (select auth.uid()) and public.can_edit_book(book_id))
  with check (account_id = (select auth.uid()) and public.can_edit_book(book_id));

create policy "creativewriter sync events view"
  on public.creativewriter_sync_events for select
  using (account_id = (select auth.uid()) and public.can_view_book(book_id));

create policy "creativewriter sync events insert"
  on public.creativewriter_sync_events for insert
  with check (account_id = (select auth.uid()) and public.can_edit_book(book_id));

create policy "creativewriter sync events update"
  on public.creativewriter_sync_events for update
  using (account_id = (select auth.uid()) and public.can_edit_book(book_id))
  with check (account_id = (select auth.uid()) and public.can_edit_book(book_id));

create index if not exists creativewriter_sync_projects_book_account_idx
  on public.creativewriter_sync_projects (book_id, account_id, updated_at desc);

create index if not exists creativewriter_sync_events_book_created_idx
  on public.creativewriter_sync_events (book_id, created_at desc);

create index if not exists creativewriter_sync_events_status_created_idx
  on public.creativewriter_sync_events (book_id, status, created_at desc);

create index if not exists creativewriter_sync_events_conflict_idx
  on public.creativewriter_sync_events (book_id, account_id, conflict_id)
  where conflict_id is not null;
