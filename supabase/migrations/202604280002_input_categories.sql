alter table public.characters
  add column if not exists age text,
  add column if not exists personality text,
  add column if not exists motivation text,
  add column if not exists wound_flaw text,
  add column if not exists important_secrets text,
  add column if not exists do_not_change_notes text;

alter table public.locations
  add column if not exists emotional_meaning text,
  add column if not exists chapters_appears jsonb default '[]',
  add column if not exists associated_characters jsonb default '[]',
  add column if not exists sensory_details text,
  add column if not exists symbolic_meaning text,
  add column if not exists continuity_notes text;

alter table public.timeline_notes
  add column if not exists event text,
  add column if not exists date_time text,
  add column if not exists characters_involved jsonb default '[]',
  add column if not exists continuity_notes text;

create table if not exists public.author_notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null unique,
  creative_instructions text,
  voice_guidance text,
  worldview_notes text,
  theological_alignment text,
  forbidden_changes text,
  revision_preferences jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.style_samples (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  title text not null,
  sample_text text,
  storage_path text,
  guidance_notes text,
  created_at timestamptz default now()
);

create table if not exists public.reference_materials (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  title text not null,
  material_type text default 'reference',
  content text,
  storage_path text,
  include_in_prompts boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.book_matter_sections (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  section_type text not null check (
    section_type in (
      'title_page',
      'copyright_page',
      'dedication',
      'acknowledgments',
      'foreword',
      'preface',
      'introduction',
      'author_bio',
      'appendix',
      'bibliography',
      'endnotes',
      'discussion_questions',
      'small_group_questions',
      'glossary'
    )
  ),
  title text,
  content text not null,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.book_outlines (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null unique,
  title text,
  content text not null,
  source text default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.revision_instructions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  title text not null,
  scope text default 'general' check (scope in ('general', 'book', 'chapter', 'scene', 'paragraph', 'passage')),
  instructions text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.author_notes enable row level security;
alter table public.style_samples enable row level security;
alter table public.reference_materials enable row level security;
alter table public.book_matter_sections enable row level security;
alter table public.book_outlines enable row level security;
alter table public.revision_instructions enable row level security;

create policy "author notes view" on public.author_notes for select using (public.can_view_book(book_id));
create policy "author notes edit" on public.author_notes for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "style samples view" on public.style_samples for select using (public.can_view_book(book_id));
create policy "style samples edit" on public.style_samples for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "reference materials view" on public.reference_materials for select using (public.can_view_book(book_id));
create policy "reference materials edit" on public.reference_materials for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "book matter view" on public.book_matter_sections for select using (public.can_view_book(book_id));
create policy "book matter edit" on public.book_matter_sections for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "book outlines view" on public.book_outlines for select using (public.can_view_book(book_id));
create policy "book outlines edit" on public.book_outlines for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "revision instructions view" on public.revision_instructions for select using (public.can_view_book(book_id));
create policy "revision instructions edit" on public.revision_instructions for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));

insert into storage.buckets (id, name, public)
values ('references', 'references', false), ('style-samples', 'style-samples', false)
on conflict (id) do nothing;

create policy "references own path read" on storage.objects for select
using (bucket_id = 'references' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "references own path write" on storage.objects for insert
with check (bucket_id = 'references' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "style samples own path read" on storage.objects for select
using (bucket_id = 'style-samples' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "style samples own path write" on storage.objects for insert
with check (bucket_id = 'style-samples' and auth.uid()::text = (storage.foldername(name))[1]);
