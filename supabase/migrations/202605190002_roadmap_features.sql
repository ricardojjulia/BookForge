-- Chapter snapshots: named checkpoints of accepted paragraph state
create table if not exists public.chapter_snapshots (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade not null,
  name text not null,
  paragraph_texts jsonb not null default '[]',
  created_at timestamptz default now()
);
alter table public.chapter_snapshots enable row level security;
create policy "chapter snapshots view" on public.chapter_snapshots for select using (public.can_view_book(book_id));
create policy "chapter snapshots manage" on public.chapter_snapshots for all using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));

-- Reader annotations: inline comments left by beta readers (viewer-role collaborators)
create table if not exists public.reader_annotations (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  paragraph_id uuid references public.paragraphs(id) on delete cascade,
  annotator_id uuid references auth.users(id) on delete cascade not null,
  note text not null,
  resolved boolean not null default false,
  created_at timestamptz default now()
);
alter table public.reader_annotations enable row level security;
create policy "annotations view own book" on public.reader_annotations for select using (public.can_view_book(book_id));
create policy "annotations insert viewer" on public.reader_annotations for insert with check (public.can_view_book(book_id) and auth.uid() = annotator_id);
create policy "annotations resolve editor" on public.reader_annotations for update using (public.can_edit_book(book_id));
create policy "annotations delete own" on public.reader_annotations for delete using (auth.uid() = annotator_id or public.can_edit_book(book_id));

-- Series: top-level container for multi-book projects
create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.series enable row level security;
create policy "series owner" on public.series for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Series notes: shared world-building facts across books in a series
create table if not exists public.series_notes (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.series(id) on delete cascade not null,
  note_type text not null check (note_type in ('character', 'timeline', 'world', 'plot_thread', 'other')),
  title text not null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.series_notes enable row level security;
create policy "series notes owner" on public.series_notes for all
  using (exists (select 1 from public.series where id = series_id and owner_id = auth.uid()))
  with check (exists (select 1 from public.series where id = series_id and owner_id = auth.uid()));

-- Link books to a series with ordering
alter table public.books
  add column if not exists series_id uuid references public.series(id) on delete set null,
  add column if not exists series_order int;

-- Author voice profile stored alongside the book bible
alter table public.book_bibles
  add column if not exists voice_profile jsonb;

-- Onboarding progress per user
alter table public.user_settings
  add column if not exists onboarding_completed_steps text[] not null default '{}';

-- Collaborator invite tokens for email-based invite flow
create table if not exists public.collaborator_invites (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  invited_by uuid references auth.users(id) on delete cascade not null,
  email text not null,
  role text not null check (role in ('viewer', 'editor', 'admin')),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'base64url'),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz default now()
);
alter table public.collaborator_invites enable row level security;
create policy "invites manage by editor" on public.collaborator_invites for all
  using (public.can_edit_book(book_id)) with check (public.can_edit_book(book_id));
create policy "invites accept by token" on public.collaborator_invites for select
  using (true);

create index if not exists chapter_snapshots_chapter_idx on public.chapter_snapshots (chapter_id, created_at desc);
create index if not exists reader_annotations_book_idx on public.reader_annotations (book_id, paragraph_id);
create index if not exists series_notes_series_idx on public.series_notes (series_id, note_type);
create index if not exists books_series_idx on public.books (series_id, series_order);
