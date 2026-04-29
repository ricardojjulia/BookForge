create table public.creation_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  working_title text not null,
  idea_prompt text not null,
  genre text,
  target_audience text,
  language text,
  target_pages int not null default 120 check (target_pages between 20 and 150),
  tone text,
  boundaries text,
  creation_mode text not null default 'single_safe' check (creation_mode in ('single_safe', 'dual_role_sequential')),
  status text not null default 'concept' check (status in ('concept', 'planning', 'approved', 'generating', 'created', 'cancelled')),
  created_book_id uuid references public.books(id) on delete set null,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.creation_plan_versions (
  id uuid primary key default gen_random_uuid(),
  creation_project_id uuid references public.creation_projects(id) on delete cascade not null,
  version_type text not null check (version_type in ('concept', 'architecture', 'character_world', 'generation_plan')),
  content jsonb not null,
  prompt_snapshot text,
  accepted boolean not null default false,
  created_at timestamptz default now()
);

alter table public.creation_projects enable row level security;
alter table public.creation_plan_versions enable row level security;

create policy "creation projects owner view"
  on public.creation_projects for select
  using (owner_id = auth.uid());

create policy "creation projects owner create"
  on public.creation_projects for insert
  with check (owner_id = auth.uid());

create policy "creation projects owner update"
  on public.creation_projects for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "creation projects owner delete"
  on public.creation_projects for delete
  using (owner_id = auth.uid());

create policy "creation plan versions owner view"
  on public.creation_plan_versions for select
  using (
    exists (
      select 1 from public.creation_projects p
      where p.id = creation_project_id
        and p.owner_id = auth.uid()
    )
  );

create policy "creation plan versions owner create"
  on public.creation_plan_versions for insert
  with check (
    exists (
      select 1 from public.creation_projects p
      where p.id = creation_project_id
        and p.owner_id = auth.uid()
    )
  );

create policy "creation plan versions owner update"
  on public.creation_plan_versions for update
  using (
    exists (
      select 1 from public.creation_projects p
      where p.id = creation_project_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.creation_projects p
      where p.id = creation_project_id
        and p.owner_id = auth.uid()
    )
  );

create index if not exists creation_projects_owner_status_idx
  on public.creation_projects (owner_id, status, updated_at desc);

create index if not exists creation_plan_versions_project_type_idx
  on public.creation_plan_versions (creation_project_id, version_type, created_at desc);
