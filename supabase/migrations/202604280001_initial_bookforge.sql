create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  owner_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  author_name text,
  genre text,
  target_audience text,
  point_of_view text,
  tense text,
  status text default 'draft',
  original_file_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.book_collaborators (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('viewer', 'editor', 'admin')),
  created_at timestamptz default now(),
  unique(book_id, user_id)
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_number int not null,
  title text,
  original_text text not null,
  current_text text,
  accepted_text text,
  summary text,
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(book_id, chapter_number)
);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade not null,
  scene_number int not null,
  original_text text not null,
  current_text text,
  accepted_text text,
  summary text,
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.paragraphs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade not null,
  scene_id uuid references public.scenes(id) on delete cascade,
  paragraph_number int not null,
  original_text text not null,
  current_text text,
  accepted_text text,
  is_locked boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.locked_passages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete cascade,
  paragraph_id uuid references public.paragraphs(id) on delete cascade,
  reason text,
  created_at timestamptz default now()
);

create table public.book_bibles (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null unique,
  content jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  name text not null,
  description text,
  role text,
  voice_notes text,
  arc_notes text,
  relationship_notes text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  name text not null,
  description text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table public.themes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  name text not null,
  description text,
  created_at timestamptz default now()
);

create table public.motifs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  name text not null,
  description text,
  occurrences jsonb default '[]',
  created_at timestamptz default now()
);

create table public.timeline_notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete cascade,
  note text not null,
  sequence_order int,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table public.revision_jobs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  paragraph_id uuid references public.paragraphs(id) on delete set null,
  mode text not null,
  status text default 'queued',
  settings jsonb default '{}',
  prompt_snapshot text,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table public.revision_versions (
  id uuid primary key default gen_random_uuid(),
  revision_job_id uuid references public.revision_jobs(id) on delete cascade not null,
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  paragraph_id uuid references public.paragraphs(id) on delete set null,
  original_text text not null,
  revised_text text not null,
  revision_notes text,
  continuity_warnings jsonb default '[]',
  accepted boolean default false,
  rejected boolean default false,
  created_at timestamptz default now()
);

create table public.revision_recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  steps jsonb not null,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.continuity_issues (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete set null,
  scene_id uuid references public.scenes(id) on delete set null,
  issue_type text,
  description text not null,
  severity text default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  suggested_fix text,
  resolved boolean default false,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table public.coherence_reports (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  report_type text not null,
  content jsonb not null,
  created_at timestamptz default now()
);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  format text not null check (format in ('docx', 'markdown', 'epub', 'pdf')),
  storage_path text,
  status text default 'pending',
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  lmstudio_base_url text default 'http://localhost:1234/v1',
  primary_rewrite_model text,
  reasoning_model text,
  extraction_model text,
  embedding_model text,
  reranker_model text,
  quality_profile text default 'balanced' check (quality_profile in ('fast', 'balanced', 'premium')),
  context_window_tokens int default 32768,
  max_output_tokens int default 4096,
  temperature numeric default 0.7,
  top_p numeric default 0.9,
  repeat_penalty numeric default 1.05,
  streaming_enabled boolean default true,
  default_revision_recipe_id uuid references public.revision_recipes(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.is_book_owner(target_book_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.books
    where id = target_book_id and owner_id = auth.uid()
  );
$$;

create or replace function public.has_book_role(target_book_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.book_collaborators
    where book_id = target_book_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

create or replace function public.can_view_book(target_book_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select public.is_book_owner(target_book_id) or public.has_book_role(target_book_id, array['viewer','editor','admin']);
$$;

create or replace function public.can_edit_book(target_book_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select public.is_book_owner(target_book_id) or public.has_book_role(target_book_id, array['editor','admin']);
$$;

create or replace function public.can_admin_book(target_book_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select public.is_book_owner(target_book_id) or public.has_book_role(target_book_id, array['admin']);
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.books enable row level security;
alter table public.book_collaborators enable row level security;
alter table public.chapters enable row level security;
alter table public.scenes enable row level security;
alter table public.paragraphs enable row level security;
alter table public.locked_passages enable row level security;
alter table public.book_bibles enable row level security;
alter table public.characters enable row level security;
alter table public.locations enable row level security;
alter table public.themes enable row level security;
alter table public.motifs enable row level security;
alter table public.timeline_notes enable row level security;
alter table public.revision_jobs enable row level security;
alter table public.revision_versions enable row level security;
alter table public.revision_recipes enable row level security;
alter table public.continuity_issues enable row level security;
alter table public.coherence_reports enable row level security;
alter table public.exports enable row level security;
alter table public.user_settings enable row level security;

create policy "profiles own access" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "projects owner access" on public.projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "books view access" on public.books for select using (public.can_view_book(id));
create policy "books owner insert" on public.books for insert with check (owner_id = auth.uid());
create policy "books edit access" on public.books for update using (public.can_edit_book(id)) with check (public.can_edit_book(id));
create policy "books owner admin delete" on public.books for delete using (public.can_admin_book(id));
create policy "collaborators visible" on public.book_collaborators for select using (public.can_view_book(book_id));
create policy "collaborators admin manage" on public.book_collaborators for all using (public.can_admin_book(book_id)) with check (public.can_admin_book(book_id));

create policy "chapters view" on public.chapters for select using (public.can_view_book(book_id));
create policy "chapters edit" on public.chapters for insert with check (public.can_edit_book(book_id));
create policy "chapters update" on public.chapters for update using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "chapters delete admin" on public.chapters for delete using (public.can_admin_book(book_id));
create policy "scenes view" on public.scenes for select using (public.can_view_book(book_id));
create policy "scenes insert edit" on public.scenes for insert with check (public.can_edit_book(book_id));
create policy "scenes update edit" on public.scenes for update using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "scenes delete admin" on public.scenes for delete using (public.can_admin_book(book_id));
create policy "paragraphs view" on public.paragraphs for select using (public.can_view_book(book_id));
create policy "paragraphs insert edit" on public.paragraphs for insert with check (public.can_edit_book(book_id));
create policy "paragraphs update edit" on public.paragraphs for update using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "paragraphs delete admin" on public.paragraphs for delete using (public.can_admin_book(book_id));

create policy "book scoped view locked" on public.locked_passages for select using (public.can_view_book(book_id));
create policy "book scoped edit locked" on public.locked_passages for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "book scoped view bible" on public.book_bibles for select using (public.can_view_book(book_id));
create policy "book scoped edit bible" on public.book_bibles for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "book scoped view characters" on public.characters for select using (public.can_view_book(book_id));
create policy "book scoped edit characters" on public.characters for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "book scoped view locations" on public.locations for select using (public.can_view_book(book_id));
create policy "book scoped edit locations" on public.locations for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "book scoped view themes" on public.themes for select using (public.can_view_book(book_id));
create policy "book scoped edit themes" on public.themes for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "book scoped view motifs" on public.motifs for select using (public.can_view_book(book_id));
create policy "book scoped edit motifs" on public.motifs for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "book scoped view timeline" on public.timeline_notes for select using (public.can_view_book(book_id));
create policy "book scoped edit timeline" on public.timeline_notes for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));

create policy "revision jobs view" on public.revision_jobs for select using (public.can_view_book(book_id));
create policy "revision jobs create" on public.revision_jobs for insert with check (public.can_edit_book(book_id));
create policy "revision jobs update" on public.revision_jobs for update using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "revision versions view" on public.revision_versions for select using (public.can_view_book(book_id));
create policy "revision versions append" on public.revision_versions for insert with check (public.can_edit_book(book_id));
create policy "revision versions accept reject" on public.revision_versions for update using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "recipes owner" on public.revision_recipes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "continuity view" on public.continuity_issues for select using (public.can_view_book(book_id));
create policy "continuity edit" on public.continuity_issues for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "reports view" on public.coherence_reports for select using (public.can_view_book(book_id));
create policy "reports create" on public.coherence_reports for insert with check (public.can_edit_book(book_id));
create policy "exports view" on public.exports for select using (public.can_view_book(book_id));
create policy "exports manage" on public.exports for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "settings own" on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('manuscripts', 'manuscripts', false), ('exports', 'exports', false), ('covers', 'covers', false)
on conflict (id) do nothing;

create policy "manuscripts own path read" on storage.objects for select
using (bucket_id = 'manuscripts' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "manuscripts own path write" on storage.objects for insert
with check (bucket_id = 'manuscripts' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "exports own path read" on storage.objects for select
using (bucket_id = 'exports' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "exports own path write" on storage.objects for insert
with check (bucket_id = 'exports' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "covers own path read" on storage.objects for select
using (bucket_id = 'covers' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "covers own path write" on storage.objects for insert
with check (bucket_id = 'covers' and auth.uid()::text = (storage.foldername(name))[1]);
