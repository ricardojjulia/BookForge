create table public.series_shared_entities (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.series(id) on delete cascade not null,
  entity_type text not null check (entity_type in ('characters', 'locations', 'themes', 'motifs')),
  source_book_id uuid references public.books(id) on delete cascade not null,
  source_entity_id uuid not null,
  shared_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  unique (series_id, entity_type, source_entity_id)
);

alter table public.series_shared_entities enable row level security;

create policy "series shared entities view"
  on public.series_shared_entities for select
  using (public.can_view_book(source_book_id));

create policy "series shared entities create"
  on public.series_shared_entities for insert
  with check (public.can_edit_book(source_book_id));

create policy "series shared entities delete"
  on public.series_shared_entities for delete
  using (public.can_edit_book(source_book_id));

create index if not exists series_shared_entities_series_idx
  on public.series_shared_entities (series_id, entity_type);
