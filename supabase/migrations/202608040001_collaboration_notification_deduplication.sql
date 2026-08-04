alter table public.collaboration_notifications
  add column if not exists dedupe_key text;

create unique index if not exists collaboration_notifications_dedupe_idx
  on public.collaboration_notifications (recipient_user_id, event_type, dedupe_key)
  where dedupe_key is not null;

create or replace function public.claim_creativewriter_assignment_due_reminders(
  p_now timestamptz,
  p_horizon timestamptz,
  p_limit integer default 100
)
returns table (
  notification_id uuid,
  book_id uuid,
  recipient_user_id uuid,
  event_type text,
  title text,
  body text,
  metadata jsonb,
  dedupe_key text
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select assignment.*
    from public.creativewriter_contributor_assignments assignment
    where assignment.status in ('assigned', 'in_progress')
      and assignment.due_at > p_now
      and assignment.due_at <= p_horizon
      and not exists (
        select 1
        from public.collaboration_notifications notification
        where notification.recipient_user_id = assignment.assignee_id
          and notification.event_type = 'creativewriter_assignment_due_soon'
            and notification.dedupe_key = 'creativewriter-assignment-due:' || assignment.id::text || ':'
              || to_char(assignment.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    order by assignment.due_at, assignment.id
    limit least(greatest(p_limit, 1), 500)
    for update skip locked
  ), inserted as (
    insert into public.collaboration_notifications (
      book_id,
      recipient_user_id,
      actor_user_id,
      event_type,
      title,
      body,
      metadata,
      dedupe_key
    )
    select
      candidate.book_id,
      candidate.assignee_id,
      null,
      'creativewriter_assignment_due_soon',
      'Contributor assignment due soon',
      'Assignment due soon: ' || candidate.title,
      jsonb_build_object(
        'assignmentId', candidate.id,
        'chapterId', candidate.chapter_id,
        'paragraphId', candidate.paragraph_id,
        'dueAt', candidate.due_at
      ),
        'creativewriter-assignment-due:' || candidate.id::text || ':'
          || to_char(candidate.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    from candidates candidate
    on conflict (recipient_user_id, event_type, dedupe_key) where dedupe_key is not null do nothing
    returning id, book_id, recipient_user_id, event_type, title, body, metadata, dedupe_key
  )
  select
    inserted.id,
    inserted.book_id,
    inserted.recipient_user_id,
    inserted.event_type,
    inserted.title,
    inserted.body,
    inserted.metadata,
    inserted.dedupe_key
  from inserted;
$$;

revoke all on function public.claim_creativewriter_assignment_due_reminders(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_creativewriter_assignment_due_reminders(timestamptz, timestamptz, integer) to service_role;