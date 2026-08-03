create or replace function public.apply_creativewriter_contributor_suggestion(
  target_book_id uuid,
  target_suggestion_id uuid,
  target_reviewer_id uuid,
  target_review_note text default null,
  target_manual_text text default null
)
returns table (
  id uuid,
  status text,
  reviewer_id uuid,
  review_note text,
  suggestion_updated_at timestamptz,
  reviewed_at timestamptz,
  applied_at timestamptz,
  withdrawn_at timestamptz,
  paragraph_id uuid,
  current_text text,
  accepted_text text,
  paragraph_updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  suggestion_row record;
  paragraph_row record;
  current_paragraph_text text;
  apply_text text;
  now_ts timestamptz := now();
begin
  if not public.can_edit_book(target_book_id) then
    raise exception 'You do not have permission to apply this suggestion.' using errcode = '42501';
  end if;

  select
    s.id,
    s.status,
    s.paragraph_id,
    s.original_text_snapshot,
    s.suggested_text
  into suggestion_row
  from public.creativewriter_contributor_suggestions s
  where s.id = target_suggestion_id
    and s.book_id = target_book_id
  for update;

  if not found then
    raise exception 'Contributor suggestion not found.' using errcode = 'P0002';
  end if;

  if suggestion_row.status <> 'accepted' then
    raise exception 'Suggestion must be accepted before it can be applied.' using errcode = 'P0001';
  end if;

  if suggestion_row.paragraph_id is null then
    raise exception 'Only paragraph-scoped suggestions can be applied to the manuscript.' using errcode = 'P0001';
  end if;

  select
    p.id,
    p.current_text,
    p.accepted_text
  into paragraph_row
  from public.paragraphs p
  where p.id = suggestion_row.paragraph_id
    and p.book_id = target_book_id
  for update;

  if not found then
    raise exception 'Suggestion target paragraph not found.' using errcode = 'P0002';
  end if;

  current_paragraph_text := coalesce(paragraph_row.current_text, paragraph_row.accepted_text, '');
  apply_text := nullif(btrim(coalesce(target_manual_text, '')), '');

  if apply_text is null then
    if suggestion_row.original_text_snapshot is not null
      and current_paragraph_text is distinct from suggestion_row.original_text_snapshot then
      raise exception 'Suggestion cannot be applied because the paragraph changed after it was proposed.' using errcode = 'P0001';
    end if;
    apply_text := suggestion_row.suggested_text;
  end if;

  update public.paragraphs
  set
    current_text = apply_text,
    accepted_text = apply_text,
    updated_at = now_ts
  where public.paragraphs.id = suggestion_row.paragraph_id
    and public.paragraphs.book_id = target_book_id;

  update public.creativewriter_contributor_suggestions
  set
    status = 'applied',
    reviewer_id = target_reviewer_id,
    review_note = target_review_note,
    updated_at = now_ts,
    reviewed_at = coalesce(public.creativewriter_contributor_suggestions.reviewed_at, now_ts),
    applied_at = now_ts,
    withdrawn_at = null
  where public.creativewriter_contributor_suggestions.id = target_suggestion_id
    and public.creativewriter_contributor_suggestions.book_id = target_book_id;

  return query
  select
    s.id,
    s.status,
    s.reviewer_id,
    s.review_note,
    s.updated_at as suggestion_updated_at,
    s.reviewed_at,
    s.applied_at,
    s.withdrawn_at,
    p.id as paragraph_id,
    p.current_text,
    p.accepted_text,
    p.updated_at as paragraph_updated_at
  from public.creativewriter_contributor_suggestions s
  join public.paragraphs p on p.id = s.paragraph_id
  where s.id = target_suggestion_id
    and s.book_id = target_book_id;
end;
$$;
