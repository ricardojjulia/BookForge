-- Book metadata timeline foundation for reproducible critic/rewrite runs.

create table if not exists public.book_metadata_snapshots (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  branch_name text not null default 'main',
  parent_snapshot_id uuid references public.book_metadata_snapshots(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  title text not null,
  summary text,
  metadata_json jsonb not null default '{}'::jsonb,
  source_type text not null default 'initial_plan' check (source_type in ('initial_plan', 'critic_update', 'manual_edit', 'system_merge')),
  source_ref_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.book_metadata_branches (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  name text not null,
  head_snapshot_id uuid references public.book_metadata_snapshots(id) on delete set null,
  is_default boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, name)
);

create table if not exists public.book_metadata_decisions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  snapshot_id uuid not null references public.book_metadata_snapshots(id) on delete cascade,
  decision_type text not null check (decision_type in ('accept', 'reject', 'postpone', 'custom')),
  subject_type text not null check (subject_type in ('recommendation', 'task', 'objective', 'constraint')),
  subject_ref text not null,
  rationale text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table if exists public.revision_jobs
  add column if not exists metadata_snapshot_id uuid references public.book_metadata_snapshots(id) on delete set null;

alter table if exists public.coherence_reports
  add column if not exists metadata_snapshot_id uuid references public.book_metadata_snapshots(id) on delete set null;

alter table if exists public.auto_review_jobs
  add column if not exists metadata_snapshot_id uuid references public.book_metadata_snapshots(id) on delete set null;

create index if not exists book_metadata_snapshots_book_branch_created_idx
  on public.book_metadata_snapshots (book_id, branch_name, created_at desc);

create index if not exists book_metadata_snapshots_book_status_created_idx
  on public.book_metadata_snapshots (book_id, status, created_at desc);

create index if not exists book_metadata_snapshots_parent_idx
  on public.book_metadata_snapshots (parent_snapshot_id);

create index if not exists book_metadata_branches_book_default_idx
  on public.book_metadata_branches (book_id, is_default desc, created_at desc);

create index if not exists book_metadata_branches_head_idx
  on public.book_metadata_branches (head_snapshot_id);

create index if not exists book_metadata_decisions_snapshot_created_idx
  on public.book_metadata_decisions (snapshot_id, created_at desc);

create index if not exists book_metadata_decisions_book_created_idx
  on public.book_metadata_decisions (book_id, created_at desc);

create index if not exists revision_jobs_metadata_snapshot_idx
  on public.revision_jobs (metadata_snapshot_id);

create index if not exists coherence_reports_metadata_snapshot_idx
  on public.coherence_reports (metadata_snapshot_id);

create index if not exists auto_review_jobs_metadata_snapshot_idx
  on public.auto_review_jobs (metadata_snapshot_id);

alter table public.book_metadata_snapshots enable row level security;
alter table public.book_metadata_branches enable row level security;
alter table public.book_metadata_decisions enable row level security;

drop policy if exists "book metadata snapshots view" on public.book_metadata_snapshots;
create policy "book metadata snapshots view" on public.book_metadata_snapshots
  for select using (public.can_view_book(book_id));

drop policy if exists "book metadata snapshots create" on public.book_metadata_snapshots;
create policy "book metadata snapshots create" on public.book_metadata_snapshots
  for insert with check (public.can_edit_book(book_id));

drop policy if exists "book metadata snapshots update" on public.book_metadata_snapshots;
create policy "book metadata snapshots update" on public.book_metadata_snapshots
  for update using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));

drop policy if exists "book metadata snapshots delete" on public.book_metadata_snapshots;
create policy "book metadata snapshots delete" on public.book_metadata_snapshots
  for delete using (public.can_admin_book(book_id));

drop policy if exists "book metadata branches view" on public.book_metadata_branches;
create policy "book metadata branches view" on public.book_metadata_branches
  for select using (public.can_view_book(book_id));

drop policy if exists "book metadata branches create" on public.book_metadata_branches;
create policy "book metadata branches create" on public.book_metadata_branches
  for insert with check (public.can_edit_book(book_id));

drop policy if exists "book metadata branches update" on public.book_metadata_branches;
create policy "book metadata branches update" on public.book_metadata_branches
  for update using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));

drop policy if exists "book metadata branches delete" on public.book_metadata_branches;
create policy "book metadata branches delete" on public.book_metadata_branches
  for delete using (public.can_admin_book(book_id));

drop policy if exists "book metadata decisions view" on public.book_metadata_decisions;
create policy "book metadata decisions view" on public.book_metadata_decisions
  for select using (public.can_view_book(book_id));

drop policy if exists "book metadata decisions create" on public.book_metadata_decisions;
create policy "book metadata decisions create" on public.book_metadata_decisions
  for insert with check (public.can_edit_book(book_id));

with source_books as (
  select
    b.id as book_id,
    b.owner_id as created_by,
    coalesce(nullif(trim(b.title), ''), 'Untitled book') as base_title,
    b.title,
    b.author_name,
    b.genre,
    b.target_audience,
    b.point_of_view,
    b.tense,
    b.status,
    coalesce(bb.content, '{}'::jsonb) as book_bible,
    coalesce(rw.mode, 'chooser') as workflow_mode,
    coalesce(rw.current_step, 1) as workflow_current_step,
    coalesce(rw.strategy_approved, false) as workflow_strategy_approved,
    coalesce(rw.post_critic_completed, false) as workflow_post_critic_completed,
    coalesce(rw.export_ready, false) as workflow_export_ready,
    coalesce(rw.metadata, '{}'::jsonb) as workflow_metadata,
    rw.id as workflow_id,
    coalesce(rc.name, 'Full-book rewrite campaign') as campaign_name,
    coalesce(rc.goal, 'custom') as campaign_goal,
    coalesce(rc.status, 'inactive') as campaign_status,
    coalesce(rc.strategy_id, 'humanized_literary') as campaign_strategy_id,
    coalesce(rc.strategy_settings, '{}'::jsonb) as campaign_strategy_settings,
    coalesce(rc.author_instructions, '') as campaign_author_instructions,
    coalesce(rc.batch_size, 0) as campaign_batch_size,
    coalesce(rc.distribute_across_chapters, true) as campaign_distribute_across_chapters,
    coalesce(rc.rewrite_existing_drafts, false) as campaign_rewrite_existing_drafts,
    coalesce(rc.rewrite_accepted, false) as campaign_rewrite_accepted,
    coalesce(rc.total_paragraphs, 0) as campaign_total_paragraphs,
    coalesce(rc.untouched_paragraphs, 0) as campaign_untouched_paragraphs,
    coalesce(rc.pending_draft_paragraphs, 0) as campaign_pending_draft_paragraphs,
    coalesce(rc.accepted_paragraphs, 0) as campaign_accepted_paragraphs,
    coalesce(rc.sampled_chapters, 0) as campaign_sampled_chapters,
    coalesce(rc.fully_covered_chapters, 0) as campaign_fully_covered_chapters,
    coalesce(rc.total_chapters, 0) as campaign_total_chapters,
    coalesce(rc.batches_run, 0) as campaign_batches_run,
    coalesce(rc.last_error, '') as campaign_last_error,
    coalesce(plan_report.content, '{}'::jsonb) as rewrite_plan,
    coalesce(critic_report.content, '{}'::jsonb) as latest_critic_report,
    coalesce(drift_report.content, '{}'::jsonb) as latest_drift_report,
    coalesce(counts.paragraph_count, 0) as paragraph_count,
    coalesce(counts.accepted_paragraph_count, 0) as accepted_paragraph_count,
    coalesce(counts.pending_draft_count, 0) as pending_draft_count
  from public.books b
  left join lateral (
    select content
    from public.book_bibles
    where book_id = b.id
    order by updated_at desc, created_at desc
    limit 1
  ) bb on true
  left join lateral (
    select *
    from public.rewrite_workflows
    where book_id = b.id
    order by updated_at desc, created_at desc
    limit 1
  ) rw on true
  left join lateral (
    select *
    from public.rewrite_campaigns
    where book_id = b.id
    order by updated_at desc, created_at desc
    limit 1
  ) rc on true
  left join lateral (
    select content
    from public.coherence_reports
    where book_id = b.id
      and report_type = 'rewrite_plan'
    order by created_at desc
    limit 1
  ) plan_report on true
  left join lateral (
    select content
    from public.coherence_reports
    where book_id = b.id
      and (
        report_type like 'critic:%'
        or report_type like 'critic_post:%'
        or report_type = 'humanized_guidance'
      )
    order by created_at desc
    limit 1
  ) critic_report on true
  left join lateral (
    select content
    from public.coherence_reports
    where book_id = b.id
      and report_type = 'rewrite_drift_check'
    order by created_at desc
    limit 1
  ) drift_report on true
  left join lateral (
    select
      count(*)::int as paragraph_count,
      count(*) filter (where accepted_text is not null)::int as accepted_paragraph_count,
      count(*) filter (where accepted_text is null and is_locked = false)::int as pending_draft_count
    from public.paragraphs
    where book_id = b.id
  ) counts on true
)
insert into public.book_metadata_snapshots (
  book_id,
  branch_name,
  parent_snapshot_id,
  status,
  title,
  summary,
  metadata_json,
  source_type,
  source_ref_id,
  created_by,
  created_at,
  updated_at
)
select
  sb.book_id,
  'main',
  null,
  'active',
  sb.base_title || ' baseline',
  'Initial metadata baseline seeded from current book state.',
  jsonb_build_object(
    'purpose', 'Seed snapshot for keeping critic and rewrite work aligned.',
    'objectives', jsonb_build_array(
      'Preserve the current book direction.',
      'Make critic and rewrite runs reproducible.',
      'Keep decisions tied to a named plan snapshot.'
    ),
    'book', jsonb_build_object(
      'title', sb.title,
      'authorName', sb.author_name,
      'genre', sb.genre,
      'targetAudience', sb.target_audience,
      'pointOfView', sb.point_of_view,
      'tense', sb.tense,
      'status', sb.status
    ),
    'context', jsonb_build_object(
      'bookBible', sb.book_bible,
      'rewriteWorkflow', jsonb_build_object(
        'mode', sb.workflow_mode,
        'currentStep', sb.workflow_current_step,
        'strategyApproved', sb.workflow_strategy_approved,
        'postCriticCompleted', sb.workflow_post_critic_completed,
        'exportReady', sb.workflow_export_ready,
        'metadata', sb.workflow_metadata
      ),
      'rewriteCampaign', jsonb_build_object(
        'name', sb.campaign_name,
        'goal', sb.campaign_goal,
        'status', sb.campaign_status,
        'strategyId', sb.campaign_strategy_id,
        'strategySettings', sb.campaign_strategy_settings,
        'authorInstructions', sb.campaign_author_instructions,
        'batchSize', sb.campaign_batch_size,
        'distributeAcrossChapters', sb.campaign_distribute_across_chapters,
        'rewriteExistingDrafts', sb.campaign_rewrite_existing_drafts,
        'rewriteAccepted', sb.campaign_rewrite_accepted,
        'totals', jsonb_build_object(
          'paragraphs', sb.campaign_total_paragraphs,
          'untouchedParagraphs', sb.campaign_untouched_paragraphs,
          'pendingDraftParagraphs', sb.campaign_pending_draft_paragraphs,
          'acceptedParagraphs', sb.campaign_accepted_paragraphs,
          'sampledChapters', sb.campaign_sampled_chapters,
          'fullyCoveredChapters', sb.campaign_fully_covered_chapters,
          'totalChapters', sb.campaign_total_chapters,
          'batchesRun', sb.campaign_batches_run
        ),
        'lastError', sb.campaign_last_error
      )
    ),
    'currentPlan', sb.rewrite_plan,
    'recommendations', sb.latest_critic_report,
    'updates', sb.latest_drift_report,
    'tasks', jsonb_build_object(
      'paragraphCount', sb.paragraph_count,
      'acceptedParagraphCount', sb.accepted_paragraph_count,
      'pendingDraftCount', sb.pending_draft_count
    )
  ),
  'initial_plan',
  sb.workflow_id,
  sb.created_by,
  now(),
  now()
from source_books sb
where not exists (
  select 1
  from public.book_metadata_snapshots existing
  where existing.book_id = sb.book_id
);

insert into public.book_metadata_branches (
  book_id,
  name,
  head_snapshot_id,
  is_default,
  created_by,
  created_at,
  updated_at
)
select
  snapshot.book_id,
  snapshot.branch_name,
  snapshot.id,
  true,
  snapshot.created_by,
  snapshot.created_at,
  snapshot.updated_at
from public.book_metadata_snapshots snapshot
where snapshot.branch_name = 'main'
  and snapshot.status = 'active'
  and not exists (
    select 1
    from public.book_metadata_branches branch
    where branch.book_id = snapshot.book_id
      and branch.name = snapshot.branch_name
  )
on conflict (book_id, name) do update
  set head_snapshot_id = excluded.head_snapshot_id,
      is_default = excluded.is_default,
      updated_at = now();