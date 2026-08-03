create table if not exists public.creativewriter_contributor_assignments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete set null,
  paragraph_id uuid references public.paragraphs(id) on delete set null,
  assignee_id uuid references auth.users(id) on delete cascade not null,
  assigner_id uuid references auth.users(id) on delete set null,
  scope text not null default 'book' check (scope in ('book', 'chapter', 'paragraph')),
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'completed', 'cancelled')),
  title text not null,
  note text,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.creativewriter_contributor_assignments enable row level security;

drop policy if exists "creativewriter assignments view" on public.creativewriter_contributor_assignments;
create policy "creativewriter assignments view"
  on public.creativewriter_contributor_assignments
  for select
  using (public.can_view_book(book_id));

drop policy if exists "creativewriter assignments create" on public.creativewriter_contributor_assignments;
create policy "creativewriter assignments create"
  on public.creativewriter_contributor_assignments
  for insert
  with check (
    public.can_edit_book(book_id)
    and (select auth.uid()) = assigner_id
  );

drop policy if exists "creativewriter assignments editor update" on public.creativewriter_contributor_assignments;
create policy "creativewriter assignments editor update"
  on public.creativewriter_contributor_assignments
  for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));

drop policy if exists "creativewriter assignments assignee status update" on public.creativewriter_contributor_assignments;
create policy "creativewriter assignments assignee status update"
  on public.creativewriter_contributor_assignments
  for update
  using ((select auth.uid()) = assignee_id)
  with check ((select auth.uid()) = assignee_id);

drop policy if exists "creativewriter assignments delete" on public.creativewriter_contributor_assignments;
create policy "creativewriter assignments delete"
  on public.creativewriter_contributor_assignments
  for delete
  using (public.can_edit_book(book_id));

create index if not exists creativewriter_contributor_assignments_book_idx
  on public.creativewriter_contributor_assignments (book_id, status, due_at, created_at desc);

create index if not exists creativewriter_contributor_assignments_assignee_idx
  on public.creativewriter_contributor_assignments (assignee_id, status, due_at);

create index if not exists creativewriter_contributor_assignments_chapter_idx
  on public.creativewriter_contributor_assignments (chapter_id, status);

create index if not exists creativewriter_contributor_assignments_paragraph_idx
  on public.creativewriter_contributor_assignments (paragraph_id, status);
