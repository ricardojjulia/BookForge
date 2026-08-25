-- Root cause finally isolated live: the accept-invite route uses .upsert()
-- (INSERT ... ON CONFLICT (book_id, user_id) DO UPDATE), not a plain
-- INSERT. Postgres needs SELECT visibility to detect whether a conflicting
-- row already exists -- confirmed by reproducing in SQL: a plain INSERT
-- with the exact same session/policies succeeds, but the identical INSERT
-- with ON CONFLICT DO UPDATE fails with the same RLS error every time.
-- The existing "collaborators visible" policy requires can_view_book(),
-- which itself requires already being a collaborator or owner -- circular
-- for a brand-new invitee who is, by definition, neither yet. Scoped to
-- "your own row" only, not visibility into other collaborators, since
-- that's all ON CONFLICT (book_id, user_id) actually needs to check.
create policy "collaborators self visible" on public.book_collaborators for select
  using (user_id = (select auth.uid()));
