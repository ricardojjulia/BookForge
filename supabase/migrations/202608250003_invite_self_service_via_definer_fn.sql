-- Every other cross-table RLS check in this codebase (can_admin_book,
-- can_edit_book, has_book_role) is wrapped in a security definer function --
-- migration 202608250002's book_collaborators self-service policies broke
-- that convention with an inline `exists (select ... from
-- collaborator_invites ...)` subquery instead. Confirmed live, extensively:
-- the exact same boolean expression returns true as a standalone SELECT
-- under a simulated session, yet the real INSERT still gets rejected by
-- "new row violates row-level security policy for table book_collaborators"
-- every time -- an inline subquery to another RLS-enabled table inside a
-- WITH CHECK clause does not evaluate the same way a security definer
-- function call does. Matching the codebase's own established pattern
-- instead of re-litigating exactly why.
create or replace function public.has_live_invite(target_book_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.collaborator_invites
    where book_id = target_book_id
      and lower(email) = lower((select auth.jwt() ->> 'email'))
      and accepted_at is null
      and expires_at > now()
  );
$$;

drop policy if exists "collaborators self insert via invite" on public.book_collaborators;
create policy "collaborators self insert via invite" on public.book_collaborators for insert
  with check (user_id = (select auth.uid()) and public.has_live_invite(book_id));

drop policy if exists "collaborators self update via invite" on public.book_collaborators;
create policy "collaborators self update via invite" on public.book_collaborators for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_live_invite(book_id));
