create table public.scene_split_suggestions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade not null,
  start_paragraph_id uuid references public.paragraphs(id) on delete cascade not null,
  title text not null,
  rationale text,
  estimated_word_count int default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.scene_split_suggestions enable row level security;

create policy "scene split suggestions view"
  on public.scene_split_suggestions for select
  using (public.can_view_book(book_id));

create policy "scene split suggestions create"
  on public.scene_split_suggestions for insert
  with check (public.can_edit_book(book_id));

create policy "scene split suggestions update"
  on public.scene_split_suggestions for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));

create policy "scene split suggestions delete"
  on public.scene_split_suggestions for delete
  using (public.can_edit_book(book_id));

create index if not exists scene_split_suggestions_book_chapter_status_idx
  on public.scene_split_suggestions (book_id, chapter_id, status);
