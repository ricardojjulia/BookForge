-- Single choke point for the "platform staff can view/edit/manage any book" bypass.
-- has_book_role is called both directly by the books table's own inlined
-- select/update/delete policies AND indirectly (via can_view_book/can_edit_book/
-- can_admin_book) by every other book-scoped table's RLS -- editing it here is the
-- one edit that reaches both paths. Based on the canonical body from
-- 202606240001_fix_linter_warnings.sql (the (select auth.uid()) init-plan form).

create or replace function public.has_book_role(target_book_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  -- NOTE: also returns true for platform staff (is_platform_staff()), regardless of
  -- allowed_roles. Do not repurpose this function for a "is this a real named
  -- collaborator" check (e.g. UI badges) -- query book_collaborators directly for that.
  select
    public.is_platform_staff()
    or exists (
      select 1 from public.book_collaborators
      where book_id = target_book_id
        and user_id = (select auth.uid())
        and role = any(allowed_roles)
    );
$$;
