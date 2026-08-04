alter table public.collaboration_notification_email_deliveries
  add column if not exists claim_token uuid;

revoke all on table public.collaboration_notification_email_deliveries from anon, authenticated;

drop function if exists public.complete_collaboration_notification_email(uuid, text, text);

create function public.complete_collaboration_notification_email(
  p_notification_id uuid,
  p_outcome text,
  p_error text,
  p_claim_token uuid
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
    next_attempt_at = case
      when p_outcome <> 'failed' then delivery.next_attempt_at
      when delivery.attempt_count + 1 = 1 then now() + interval '5 minutes'
      when delivery.attempt_count + 1 = 2 then now() + interval '15 minutes'
      when delivery.attempt_count + 1 = 3 then now() + interval '1 hour'
      else now() + interval '6 hours'
    end,
    locked_at = null,
    claim_token = null,
    last_error = case when p_outcome = 'failed' then left(coalesce(p_error, 'Email delivery failed'), 1000) else null end,
    sent_at = case when p_outcome = 'sent' then now() else delivery.sent_at end,
    updated_at = now()
  where delivery.notification_id = p_notification_id
    and delivery.status not in ('sent', 'skipped', 'dead')
    and (
      (p_claim_token is null and delivery.status in ('pending', 'failed') and delivery.claim_token is null)
      or (p_claim_token is not null and delivery.status = 'processing' and delivery.claim_token = p_claim_token)
    );

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.complete_collaboration_notification_email(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.complete_collaboration_notification_email(uuid, text, text, uuid) to service_role;

drop function if exists public.claim_collaboration_notification_email_retries(timestamptz, integer);

create function public.claim_collaboration_notification_email_retries(
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
  claim_token uuid,
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
      (delivery.status in ('pending', 'failed') and delivery.next_attempt_at <= p_now)
      or (delivery.status = 'processing' and delivery.locked_at <= p_now - interval '15 minutes')
    )
      and delivery.attempt_count < 5
    order by delivery.next_attempt_at, delivery.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked
  ), claimed as (
    update public.collaboration_notification_email_deliveries delivery
    set
      status = 'processing',
      locked_at = p_now,
      claim_token = gen_random_uuid(),
      updated_at = p_now
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  ), continuation as (
    select exists (
      select 1
      from public.collaboration_notification_email_deliveries delivery
      where (
        (delivery.status in ('pending', 'failed') and delivery.next_attempt_at <= p_now)
        or (delivery.status = 'processing' and delivery.locked_at <= p_now - interval '15 minutes')
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
    claimed.claim_token,
    continuation.has_more
  from claimed
  join public.collaboration_notifications notification on notification.id = claimed.notification_id
  cross join continuation;
$$;

revoke all on function public.claim_collaboration_notification_email_retries(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_collaboration_notification_email_retries(timestamptz, integer) to service_role;