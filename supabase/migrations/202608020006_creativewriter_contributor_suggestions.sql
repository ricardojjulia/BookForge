create table if not exists public.creativewriter_contributor_suggestions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete set null,
  paragraph_id uuid references public.paragraphs(id) on delete set null,
  proposer_id uuid references auth.users(id) on delete cascade not null,
  reviewer_id uuid references auth.users(id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'withdrawn', 'applied', 'superseded')),
  original_text_snapshot text,
  suggested_text text not null,
  rationale text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  applied_at timestamptz,
  withdrawn_at timestamptz
);

alter table public.creativewriter_contributor_suggestions enable row level security;

drop policy if exists "creativewriter suggestions view" on public.creativewriter_contributor_suggestions;
create policy "creativewriter suggestions view"
  on public.creativewriter_contributor_suggestions
  for select
  using (public.can_view_book(book_id));

drop policy if exists "creativewriter suggestions create" on public.creativewriter_contributor_suggestions;
create policy "creativewriter suggestions create"
  on public.creativewriter_contributor_suggestions
  for insert
  with check (
    public.can_view_book(book_id)
    and (select auth.uid()) = proposer_id
    and status = 'proposed'
  );

drop policy if exists "creativewriter suggestions update" on public.creativewriter_contributor_suggestions;
create policy "creativewriter suggestions update"
  on public.creativewriter_contributor_suggestions
  for update
  using (
    public.can_edit_book(book_id)
    or ((select auth.uid()) = proposer_id and status = 'proposed')
  )
  with check (
    public.can_edit_book(book_id)
    or ((select auth.uid()) = proposer_id and status = 'withdrawn')
  );

create index if not exists creativewriter_contributor_suggestions_book_idx
  on public.creativewriter_contributor_suggestions (book_id, status, created_at desc);

create index if not exists creativewriter_contributor_suggestions_paragraph_idx
  on public.creativewriter_contributor_suggestions (paragraph_id, status);

create index if not exists creativewriter_contributor_suggestions_proposer_idx
  on public.creativewriter_contributor_suggestions (proposer_id, created_at desc);
