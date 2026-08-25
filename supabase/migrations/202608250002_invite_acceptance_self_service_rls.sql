-- Accepting a collaborator invite means a brand-new, not-yet-collaborator
-- user inserting themselves into book_collaborators and marking their own
-- invite accepted -- but both write paths were gated on can_admin_book /
-- can_edit_book, which the invitee never satisfies (that's the entire
-- point of the flow). Confirmed live: every single invite acceptance
-- 500'd with a Postgres permission-denied error, hidden behind the
-- generic "Failed." fallback since PostgrestError isn't an Error instance
-- and the route logged nothing (same anti-pattern as the invite-creation
-- bug fixed earlier today).
--
-- Scope each self-service policy tightly to "there is a live, unexpired,
-- unaccepted invite for MY email on this exact book" so a user can only
-- ever grant themselves the access an admin already explicitly invited
-- them to, nothing broader. auth.jwt() ->> 'email' (not a join to
-- auth.users, which `authenticated` isn't granted select on) reads the
-- email straight from the session's own JWT.
create policy "collaborators self insert via invite" on public.book_collaborators for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.collaborator_invites ci
      where ci.book_id = book_collaborators.book_id
        and lower(ci.email) = lower(auth.jwt() ->> 'email')
        and ci.accepted_at is null
        and ci.expires_at > now()
    )
  );

create policy "collaborators self update via invite" on public.book_collaborators for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.collaborator_invites ci
      where ci.book_id = book_collaborators.book_id
        and lower(ci.email) = lower(auth.jwt() ->> 'email')
        and ci.accepted_at is null
        and ci.expires_at > now()
    )
  );

-- The route's final `.update({ accepted_at })` call on collaborator_invites
-- doesn't check its result, so this same RLS gap wouldn't have surfaced as
-- a 500 -- it would have silently no-op'd, leaving accepted_at permanently
-- null and the same invite token acceptable (and re-insertable) forever.
create policy "invites self accept" on public.collaborator_invites for update
  using (
    lower(email) = lower(auth.jwt() ->> 'email')
    and accepted_at is null
    and expires_at > now()
  )
  with check (
    lower(email) = lower(auth.jwt() ->> 'email')
  );
