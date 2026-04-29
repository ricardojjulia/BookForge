create table public.rewrite_workflows (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null unique,
  owner_id uuid references auth.users(id) on delete set null,
  mode text not null default 'chooser' check (mode in ('chooser', 'wizard', 'manual')),
  current_step int not null default 1 check (current_step between 1 and 7),
  strategy_approved boolean not null default false,
  sample_revision_job_id uuid references public.revision_jobs(id) on delete set null,
  campaign_id uuid references public.rewrite_campaigns(id) on delete set null,
  last_drift_report_id uuid references public.coherence_reports(id) on delete set null,
  post_critic_completed boolean not null default false,
  export_ready boolean not null default false,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.rewrite_workflows enable row level security;

create policy "rewrite workflows view"
  on public.rewrite_workflows for select
  using (public.can_view_book(book_id));

create policy "rewrite workflows create"
  on public.rewrite_workflows for insert
  with check (public.can_edit_book(book_id));

create policy "rewrite workflows update"
  on public.rewrite_workflows for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));

create policy "rewrite workflows delete"
  on public.rewrite_workflows for delete
  using (public.can_edit_book(book_id));

create index if not exists rewrite_workflows_book_mode_idx
  on public.rewrite_workflows (book_id, mode, updated_at desc);
