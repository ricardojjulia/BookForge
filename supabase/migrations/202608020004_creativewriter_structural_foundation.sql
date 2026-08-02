alter table public.books
  add column if not exists structure_version bigint not null default 0;

alter table public.chapters
  add column if not exists structure_version bigint not null default 0;

create table if not exists public.creativewriter_structure_tombstones (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  entity_type text not null check (entity_type in ('chapter', 'paragraph')),
  entity_id uuid not null,
  parent_entity_type text not null check (parent_entity_type in ('book', 'chapter')),
  parent_entity_id uuid not null,
  last_known_position int,
  last_known_text text,
  known_child_ids uuid[] not null default '{}',
  delete_reason text,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(book_id, entity_type, entity_id)
);

alter table public.creativewriter_structure_tombstones enable row level security;

create policy "creativewriter structure tombstones view"
  on public.creativewriter_structure_tombstones for select
  using (public.can_view_book(book_id));

create policy "creativewriter structure tombstones insert"
  on public.creativewriter_structure_tombstones for insert
  with check (public.can_edit_book(book_id) and (deleted_by is null or deleted_by = (select auth.uid())));

create index if not exists creativewriter_structure_tombstones_book_deleted_idx
  on public.creativewriter_structure_tombstones (book_id, deleted_at desc);

create index if not exists creativewriter_structure_tombstones_parent_idx
  on public.creativewriter_structure_tombstones (book_id, parent_entity_type, parent_entity_id);

create index if not exists chapters_book_structure_version_idx
  on public.chapters (book_id, structure_version);
