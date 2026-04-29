create table public.abridgement_plans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  created_by uuid references auth.users(id) on delete set null,
  target_reduction_percent int not null default 25,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'applied')),
  summary text,
  content jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.abridgement_suggestions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.abridgement_plans(id) on delete cascade not null,
  book_id uuid references public.books(id) on delete cascade not null,
  suggestion_type text not null check (suggestion_type in ('cut_chapter', 'merge_chapter', 'cut_scene', 'merge_scene', 'cut_paragraph', 'tighten_paragraph')),
  chapter_id uuid references public.chapters(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete cascade,
  paragraph_id uuid references public.paragraphs(id) on delete cascade,
  target_chapter_id uuid references public.chapters(id) on delete set null,
  title text not null,
  rationale text,
  estimated_word_savings int default 0,
  continuity_risk text default 'medium' check (continuity_risk in ('low', 'medium', 'high')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.abridgement_plans enable row level security;
alter table public.abridgement_suggestions enable row level security;

create policy "abridgement plans view"
  on public.abridgement_plans for select
  using (public.can_view_book(book_id));

create policy "abridgement plans create"
  on public.abridgement_plans for insert
  with check (public.can_edit_book(book_id));

create policy "abridgement plans update"
  on public.abridgement_plans for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));

create policy "abridgement plans delete"
  on public.abridgement_plans for delete
  using (public.can_edit_book(book_id));

create policy "abridgement suggestions view"
  on public.abridgement_suggestions for select
  using (public.can_view_book(book_id));

create policy "abridgement suggestions create"
  on public.abridgement_suggestions for insert
  with check (public.can_edit_book(book_id));

create policy "abridgement suggestions update"
  on public.abridgement_suggestions for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));

create policy "abridgement suggestions delete"
  on public.abridgement_suggestions for delete
  using (public.can_edit_book(book_id));

create index if not exists abridgement_plans_book_created_idx
  on public.abridgement_plans (book_id, created_at desc);

create index if not exists abridgement_suggestions_book_status_idx
  on public.abridgement_suggestions (book_id, status, suggestion_type);
