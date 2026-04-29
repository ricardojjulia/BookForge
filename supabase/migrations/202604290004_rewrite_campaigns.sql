create table public.rewrite_campaigns (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade not null,
  created_by uuid references auth.users(id) on delete set null,
  name text not null default 'Full-book rewrite campaign',
  goal text not null default 'full_coverage' check (goal in ('sample_all_chapters', 'full_coverage', 'custom')),
  status text not null default 'active' check (status in ('active', 'running', 'paused', 'completed', 'cancelled', 'failed')),
  strategy_id text not null default 'humanized_literary',
  strategy_settings jsonb default '{}',
  author_instructions text,
  batch_size int not null default 25,
  distribute_across_chapters boolean not null default true,
  rewrite_existing_drafts boolean not null default false,
  rewrite_accepted boolean not null default false,
  total_paragraphs int not null default 0,
  untouched_paragraphs int not null default 0,
  pending_draft_paragraphs int not null default 0,
  accepted_paragraphs int not null default 0,
  sampled_chapters int not null default 0,
  fully_covered_chapters int not null default 0,
  total_chapters int not null default 0,
  batches_run int not null default 0,
  last_revision_job_id uuid references public.revision_jobs(id) on delete set null,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.rewrite_campaigns enable row level security;

create policy "rewrite campaigns view"
  on public.rewrite_campaigns for select
  using (public.can_view_book(book_id));

create policy "rewrite campaigns create"
  on public.rewrite_campaigns for insert
  with check (public.can_edit_book(book_id));

create policy "rewrite campaigns update"
  on public.rewrite_campaigns for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));

create policy "rewrite campaigns delete"
  on public.rewrite_campaigns for delete
  using (public.can_edit_book(book_id));

create index if not exists rewrite_campaigns_book_status_idx
  on public.rewrite_campaigns (book_id, status, created_at desc);
