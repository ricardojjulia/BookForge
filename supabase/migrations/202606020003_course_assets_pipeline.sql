create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  source_book_id uuid references public.books(id) on delete cascade not null unique,
  owner_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade not null,
  source_chapter_id uuid references public.chapters(id) on delete set null,
  title text not null,
  module_order int not null default 1,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade not null,
  module_id uuid references public.course_modules(id) on delete cascade,
  source_chapter_id uuid references public.chapters(id) on delete set null,
  title text not null,
  lesson_type text not null check (lesson_type in ('chapter_summary', 'reading', 'discussion')),
  lesson_order int not null default 1,
  content text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.course_assets (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade not null,
  source_chapter_id uuid references public.chapters(id) on delete set null,
  source_export_id uuid references public.exports(id) on delete set null,
  asset_type text not null check (asset_type in ('book_export', 'matter_section', 'chapter_summary')),
  title text not null,
  content_text text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.course_lessons enable row level security;
alter table public.course_assets enable row level security;

create policy "courses view" on public.courses for select
  using (public.can_view_book(source_book_id));
create policy "courses edit" on public.courses for all
  using (public.can_edit_book(source_book_id))
  with check (public.can_edit_book(source_book_id));

create policy "course modules view" on public.course_modules for select
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.can_view_book(c.source_book_id)
    )
  );
create policy "course modules edit" on public.course_modules for all
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.can_edit_book(c.source_book_id)
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.can_edit_book(c.source_book_id)
    )
  );

create policy "course lessons view" on public.course_lessons for select
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.can_view_book(c.source_book_id)
    )
  );
create policy "course lessons edit" on public.course_lessons for all
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.can_edit_book(c.source_book_id)
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.can_edit_book(c.source_book_id)
    )
  );

create policy "course assets view" on public.course_assets for select
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.can_view_book(c.source_book_id)
    )
  );
create policy "course assets edit" on public.course_assets for all
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.can_edit_book(c.source_book_id)
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.can_edit_book(c.source_book_id)
    )
  );

create index if not exists courses_source_book_idx on public.courses (source_book_id);
create index if not exists course_modules_course_order_idx on public.course_modules (course_id, module_order);
create index if not exists course_lessons_course_module_order_idx on public.course_lessons (course_id, module_id, lesson_order);
create index if not exists course_assets_course_type_idx on public.course_assets (course_id, asset_type, created_at desc);
