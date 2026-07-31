alter table public.revision_versions
  add column if not exists reviewer_id uuid references auth.users(id) on delete set null,
  add column if not exists review_assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists review_status text not null default 'unassigned'
    check (review_status in ('unassigned', 'assigned', 'in_review', 'approved', 'changes_requested')),
  add column if not exists review_notes text,
  add column if not exists review_updated_at timestamptz,
  add column if not exists review_decided_at timestamptz;

create index if not exists revision_versions_book_review_status_idx
  on public.revision_versions (book_id, review_status, created_at desc);

alter table public.rewrite_workflows
  add column if not exists reviewer_id uuid references auth.users(id) on delete set null,
  add column if not exists review_assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists review_status text not null default 'unassigned'
    check (review_status in ('unassigned', 'assigned', 'in_review', 'approved', 'changes_requested')),
  add column if not exists review_notes text,
  add column if not exists review_updated_at timestamptz,
  add column if not exists review_decided_at timestamptz;

create index if not exists rewrite_workflows_book_review_status_idx
  on public.rewrite_workflows (book_id, review_status, updated_at desc);

create table if not exists public.collaboration_notifications (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  recipient_user_id uuid references auth.users(id) on delete cascade not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  title text not null,
  body text not null,
  metadata jsonb default '{}',
  read_at timestamptz,
  created_at timestamptz default now()
);

alter table public.collaboration_notifications enable row level security;

create policy "collab notifications view own"
  on public.collaboration_notifications for select
  using (recipient_user_id = auth.uid() and public.can_view_book(book_id));

create policy "collab notifications create by editor"
  on public.collaboration_notifications for insert
  with check (public.can_edit_book(book_id));

create policy "collab notifications mark read"
  on public.collaboration_notifications for update
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create index if not exists collaboration_notifications_user_created_idx
  on public.collaboration_notifications (recipient_user_id, created_at desc);

create index if not exists collaboration_notifications_book_created_idx
  on public.collaboration_notifications (book_id, created_at desc);
