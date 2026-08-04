create table if not exists public.collaboration_notification_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.collaboration_notifications(id) on delete cascade not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'skipped', 'failed', 'dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default (now() + interval '5 minutes'),
  locked_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.collaboration_notification_email_deliveries enable row level security;

create index if not exists collaboration_notification_email_retry_idx
  on public.collaboration_notification_email_deliveries (next_attempt_at, created_at)
  where status in ('pending', 'failed', 'processing');

create or replace function public.queue_collaboration_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.collaboration_notification_email_deliveries (notification_id)
  values (new.id)
  on conflict (notification_id) do nothing;
  return new;
end;
$$;

drop trigger if exists collaboration_notification_email_queue_trigger on public.collaboration_notifications;
create trigger collaboration_notification_email_queue_trigger
  after insert on public.collaboration_notifications
  for each row execute function public.queue_collaboration_notification_email();

create or replace function public.complete_collaboration_notification_email(
  p_notification_id uuid,
  p_outcome text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if p_outcome not in ('sent', 'skipped', 'failed') then
    raise exception 'Unsupported email delivery outcome';
  end if;

  update public.collaboration_notification_email_deliveries delivery
  set
    attempt_count = delivery.attempt_count + 1,
    status = case
      when p_outcome = 'failed' and delivery.attempt_count + 1 >= 5 then 'dead'
      else p_outcome
    end,
    next_attempt_at = case delivery.attempt_count + 1
      when 1 then now() + interval '5 minutes'
      when 2 then now() + interval '15 minutes'
      when 3 then now() + interval '1 hour'
      else now() + interval '6 hours'
    end,
    locked_at = null,
    last_error = case when p_outcome = 'failed' then left(coalesce(p_error, 'Email delivery failed'), 1000) else null end,
    sent_at = case when p_outcome = 'sent' then now() else delivery.sent_at end,
    updated_at = now()
  from public.collaboration_notifications notification
  where delivery.notification_id = p_notification_id
    and notification.id = delivery.notification_id
    and delivery.status not in ('sent', 'skipped', 'dead')
    and (
      (select auth.role()) = 'service_role'
      or notification.actor_user_id = (select auth.uid())
    );

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.complete_collaboration_notification_email(uuid, text, text) from public, anon;
grant execute on function public.complete_collaboration_notification_email(uuid, text, text) to authenticated, service_role;

create or replace function public.claim_collaboration_notification_email_retries(
  p_now timestamptz,
  p_limit integer default 50
)
returns table (
  delivery_id uuid,
  notification_id uuid,
  book_id uuid,
  recipient_user_id uuid,
  actor_user_id uuid,
  title text,
  body text,
  has_more boolean
)
language sql
security definer
set search_path = public
as $$
  with candidates as materialized (
    select delivery.id
    from public.collaboration_notification_email_deliveries delivery
    where (
      (
          delivery.status in ('pending', 'failed')
          and delivery.next_attempt_at <= p_now
        ) or (
          delivery.status = 'processing'
          and delivery.locked_at <= p_now - interval '15 minutes'
        )
      )
      and delivery.attempt_count < 5
    order by delivery.next_attempt_at, delivery.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked
  ), claimed as (
    update public.collaboration_notification_email_deliveries delivery
    set status = 'processing', locked_at = p_now, updated_at = p_now
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  ), continuation as (
    select exists (
      select 1
      from public.collaboration_notification_email_deliveries delivery
      where (
        (
            delivery.status in ('pending', 'failed')
            and delivery.next_attempt_at <= p_now
          ) or (
            delivery.status = 'processing'
            and delivery.locked_at <= p_now - interval '15 minutes'
          )
        )
        and delivery.attempt_count < 5
        and not exists (select 1 from candidates candidate where candidate.id = delivery.id)
    ) as has_more
  )
  select
    claimed.id,
    notification.id,
    notification.book_id,
    notification.recipient_user_id,
    notification.actor_user_id,
    notification.title,
    notification.body,
    continuation.has_more
  from claimed
  join public.collaboration_notifications notification on notification.id = claimed.notification_id
  cross join continuation;
$$;

revoke all on function public.claim_collaboration_notification_email_retries(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_collaboration_notification_email_retries(timestamptz, integer) to service_role;