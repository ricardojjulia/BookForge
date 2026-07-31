-- Migration: fix database linter performance warnings
-- Target: auth_rls_initplan and multiple_permissive_policies

-- 1. Helper Functions Update
create or replace function public.is_book_owner(target_book_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.books
    where id = target_book_id and owner_id = (select auth.uid())
  );
$$;

create or replace function public.has_book_role(target_book_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.book_collaborators
    where book_id = target_book_id
      and user_id = (select auth.uid())
      and role = any(allowed_roles)
  );
$$;


-- 2. Policy Performance Optimization (auth_rls_initplan)

-- public.profiles
drop policy if exists "profiles own access" on public.profiles;
create policy "profiles own access" on public.profiles for all
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- public.projects
drop policy if exists "projects owner access" on public.projects;
create policy "projects owner access" on public.projects for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- public.books
drop policy if exists "books owner insert" on public.books;
create policy "books owner insert" on public.books for insert
  with check (owner_id = (select auth.uid()));

drop policy if exists "books view access" on public.books;
create policy "books view access" on public.books for select
  using (
    owner_id = (select auth.uid())
    or public.has_book_role(id, array['viewer','editor','admin'])
  );

drop policy if exists "books edit access" on public.books;
create policy "books edit access" on public.books for update
  using (
    owner_id = (select auth.uid())
    or public.has_book_role(id, array['editor','admin'])
  )
  with check (
    owner_id = (select auth.uid())
    or public.has_book_role(id, array['editor','admin'])
  );

drop policy if exists "books owner admin delete" on public.books;
create policy "books owner admin delete" on public.books for delete
  using (
    owner_id = (select auth.uid())
    or public.has_book_role(id, array['admin'])
  );

-- public.revision_recipes
drop policy if exists "recipes owner" on public.revision_recipes;
create policy "recipes owner" on public.revision_recipes for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- public.user_settings
drop policy if exists "settings own" on public.user_settings;
create policy "settings own" on public.user_settings for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- public.creation_projects
drop policy if exists "creation projects owner view" on public.creation_projects;
create policy "creation projects owner view" on public.creation_projects for select
  using (owner_id = (select auth.uid()));

drop policy if exists "creation projects owner create" on public.creation_projects;
create policy "creation projects owner create" on public.creation_projects for insert
  with check (owner_id = (select auth.uid()));

drop policy if exists "creation projects owner update" on public.creation_projects;
create policy "creation projects owner update" on public.creation_projects for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "creation projects owner delete" on public.creation_projects;
create policy "creation projects owner delete" on public.creation_projects for delete
  using (owner_id = (select auth.uid()));

-- public.creation_plan_versions
drop policy if exists "creation plan versions owner view" on public.creation_plan_versions;
create policy "creation plan versions owner view" on public.creation_plan_versions for select
  using (exists (select 1 from public.creation_projects p where p.id = creation_project_id and p.owner_id = (select auth.uid())));

drop policy if exists "creation plan versions owner create" on public.creation_plan_versions;
create policy "creation plan versions owner create" on public.creation_plan_versions for insert
  with check (exists (select 1 from public.creation_projects p where p.id = creation_project_id and p.owner_id = (select auth.uid())));

drop policy if exists "creation plan versions owner update" on public.creation_plan_versions;
create policy "creation plan versions owner update" on public.creation_plan_versions for update
  using (exists (select 1 from public.creation_projects p where p.id = creation_project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.creation_projects p where p.id = creation_project_id and p.owner_id = (select auth.uid())));

-- public.reader_annotations
drop policy if exists "annotations insert viewer" on public.reader_annotations;
create policy "annotations insert viewer" on public.reader_annotations for insert
  with check (public.can_view_book(book_id) and (select auth.uid()) = annotator_id);

drop policy if exists "annotations delete own" on public.reader_annotations;
create policy "annotations delete own" on public.reader_annotations for delete
  using ((select auth.uid()) = annotator_id or public.can_edit_book(book_id));

-- public.series
drop policy if exists "series owner" on public.series;
create policy "series owner" on public.series for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- public.series_notes
drop policy if exists "series notes owner" on public.series_notes;
create policy "series notes owner" on public.series_notes for all
  using (exists (select 1 from public.series where id = series_id and owner_id = (select auth.uid())))
  with check (exists (select 1 from public.series where id = series_id and owner_id = (select auth.uid())));

-- public.auto_review_jobs
drop policy if exists "Users manage their own auto_review_jobs" on public.auto_review_jobs;
create policy "Users manage their own auto_review_jobs" on public.auto_review_jobs for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- public.guidance_tasks
drop policy if exists "Users manage their own guidance tasks" on public.guidance_tasks;
create policy "Users manage their own guidance tasks" on public.guidance_tasks for all
  using (
    book_id in (
      select id from public.books where owner_id = (select auth.uid())
    )
  );

-- public.freshness_alerts
drop policy if exists "freshness alerts select own" on public.freshness_alerts;
create policy "freshness alerts select own" on public.freshness_alerts for select
  using ((select auth.uid()) = user_id);

drop policy if exists "freshness alerts insert own" on public.freshness_alerts;
create policy "freshness alerts insert own" on public.freshness_alerts for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "freshness alerts update own" on public.freshness_alerts;
create policy "freshness alerts update own" on public.freshness_alerts for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- public.freshness_events
drop policy if exists "freshness events select own" on public.freshness_events;
create policy "freshness events select own" on public.freshness_events for select
  using ((select auth.uid()) = user_id);

drop policy if exists "freshness events insert own" on public.freshness_events;
create policy "freshness events insert own" on public.freshness_events for insert
  with check ((select auth.uid()) = user_id);

-- Storage bucket object policies
drop policy if exists "manuscripts own path read" on storage.objects;
create policy "manuscripts own path read" on storage.objects for select
  using (bucket_id = 'manuscripts' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "manuscripts own path write" on storage.objects;
create policy "manuscripts own path write" on storage.objects for insert
  with check (bucket_id = 'manuscripts' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "exports own path read" on storage.objects;
create policy "exports own path read" on storage.objects for select
  using (bucket_id = 'exports' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "exports own path write" on storage.objects;
create policy "exports own path write" on storage.objects for insert
  with check (bucket_id = 'exports' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "covers own path read" on storage.objects;
create policy "covers own path read" on storage.objects for select
  using (bucket_id = 'covers' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "covers own path write" on storage.objects;
create policy "covers own path write" on storage.objects for insert
  with check (bucket_id = 'covers' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "references own path read" on storage.objects;
create policy "references own path read" on storage.objects for select
  using (bucket_id = 'references' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "references own path write" on storage.objects;
create policy "references own path write" on storage.objects for insert
  with check (bucket_id = 'references' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "style samples own path read" on storage.objects;
create policy "style samples own path read" on storage.objects for select
  using (bucket_id = 'style-samples' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "style samples own path write" on storage.objects;
create policy "style samples own path write" on storage.objects for insert
  with check (bucket_id = 'style-samples' and (select auth.uid())::text = (storage.foldername(name))[1]);

-- public.collaboration_notifications
drop policy if exists "collab notifications view own" on public.collaboration_notifications;
create policy "collab notifications view own" on public.collaboration_notifications for select
  using (recipient_user_id = (select auth.uid()) and public.can_view_book(book_id));

drop policy if exists "collab notifications mark read" on public.collaboration_notifications;
create policy "collab notifications mark read" on public.collaboration_notifications for update
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));


-- 3. Overlapping Policies Splitting (multiple_permissive_policies)

-- public.author_notes
drop policy if exists "author notes edit" on public.author_notes;
create policy "author notes insert" on public.author_notes for insert
  with check (public.can_edit_book(book_id));
create policy "author notes update" on public.author_notes for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "author notes delete" on public.author_notes for delete
  using (public.can_edit_book(book_id));

-- public.style_samples
drop policy if exists "style samples edit" on public.style_samples;
create policy "style samples insert" on public.style_samples for insert
  with check (public.can_edit_book(book_id));
create policy "style samples update" on public.style_samples for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "style samples delete" on public.style_samples for delete
  using (public.can_edit_book(book_id));

-- public.reference_materials
drop policy if exists "reference materials edit" on public.reference_materials;
create policy "reference materials insert" on public.reference_materials for insert
  with check (public.can_edit_book(book_id));
create policy "reference materials update" on public.reference_materials for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "reference materials delete" on public.reference_materials for delete
  using (public.can_edit_book(book_id));

-- public.book_matter_sections
drop policy if exists "book matter edit" on public.book_matter_sections;
create policy "book matter insert" on public.book_matter_sections for insert
  with check (public.can_edit_book(book_id));
create policy "book matter update" on public.book_matter_sections for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "book matter delete" on public.book_matter_sections for delete
  using (public.can_edit_book(book_id));

-- public.book_outlines
drop policy if exists "book outlines edit" on public.book_outlines;
create policy "book outlines insert" on public.book_outlines for insert
  with check (public.can_edit_book(book_id));
create policy "book outlines update" on public.book_outlines for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "book outlines delete" on public.book_outlines for delete
  using (public.can_edit_book(book_id));

-- public.revision_instructions
drop policy if exists "revision instructions edit" on public.revision_instructions;
create policy "revision instructions insert" on public.revision_instructions for insert
  with check (public.can_edit_book(book_id));
create policy "revision instructions update" on public.revision_instructions for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "revision instructions delete" on public.revision_instructions for delete
  using (public.can_edit_book(book_id));

-- public.locked_passages
drop policy if exists "book scoped edit locked" on public.locked_passages;
create policy "book scoped insert locked" on public.locked_passages for insert
  with check (public.can_edit_book(book_id));
create policy "book scoped update locked" on public.locked_passages for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "book scoped delete locked" on public.locked_passages for delete
  using (public.can_edit_book(book_id));

-- public.book_bibles
drop policy if exists "book scoped edit bible" on public.book_bibles;
create policy "book scoped insert bible" on public.book_bibles for insert
  with check (public.can_edit_book(book_id));
create policy "book scoped update bible" on public.book_bibles for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "book scoped delete bible" on public.book_bibles for delete
  using (public.can_edit_book(book_id));

-- public.characters
drop policy if exists "book scoped edit characters" on public.characters;
create policy "book scoped insert characters" on public.characters for insert
  with check (public.can_edit_book(book_id));
create policy "book scoped update characters" on public.characters for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "book scoped delete characters" on public.characters for delete
  using (public.can_edit_book(book_id));

-- public.locations
drop policy if exists "book scoped edit locations" on public.locations;
create policy "book scoped insert locations" on public.locations for insert
  with check (public.can_edit_book(book_id));
create policy "book scoped update locations" on public.locations for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "book scoped delete locations" on public.locations for delete
  using (public.can_edit_book(book_id));

-- public.themes
drop policy if exists "book scoped edit themes" on public.themes;
create policy "book scoped insert themes" on public.themes for insert
  with check (public.can_edit_book(book_id));
create policy "book scoped update themes" on public.themes for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "book scoped delete themes" on public.themes for delete
  using (public.can_edit_book(book_id));

-- public.motifs
drop policy if exists "book scoped edit motifs" on public.motifs;
create policy "book scoped insert motifs" on public.motifs for insert
  with check (public.can_edit_book(book_id));
create policy "book scoped update motifs" on public.motifs for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "book scoped delete motifs" on public.motifs for delete
  using (public.can_edit_book(book_id));

-- public.timeline_notes
drop policy if exists "book scoped edit timeline" on public.timeline_notes;
create policy "book scoped insert timeline" on public.timeline_notes for insert
  with check (public.can_edit_book(book_id));
create policy "book scoped update timeline" on public.timeline_notes for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "book scoped delete timeline" on public.timeline_notes for delete
  using (public.can_edit_book(book_id));

-- public.continuity_issues
drop policy if exists "continuity edit" on public.continuity_issues;
create policy "continuity insert" on public.continuity_issues for insert
  with check (public.can_edit_book(book_id));
create policy "continuity update" on public.continuity_issues for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "continuity delete" on public.continuity_issues for delete
  using (public.can_edit_book(book_id));

-- public.exports
drop policy if exists "exports manage" on public.exports;
create policy "exports insert" on public.exports for insert
  with check (public.can_edit_book(book_id));
create policy "exports update" on public.exports for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "exports delete" on public.exports for delete
  using (public.can_edit_book(book_id));

-- public.book_collaborators
drop policy if exists "collaborators admin manage" on public.book_collaborators;
create policy "collaborators admin insert" on public.book_collaborators for insert
  with check (public.can_admin_book(book_id));
create policy "collaborators admin update" on public.book_collaborators for update
  using (public.can_admin_book(book_id))
  with check (public.can_admin_book(book_id));
create policy "collaborators admin delete" on public.book_collaborators for delete
  using (public.can_admin_book(book_id));

-- public.chapter_snapshots
drop policy if exists "chapter snapshots manage" on public.chapter_snapshots;
create policy "chapter snapshots insert" on public.chapter_snapshots for insert
  with check (public.can_edit_book(book_id));
create policy "chapter snapshots update" on public.chapter_snapshots for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "chapter snapshots delete" on public.chapter_snapshots for delete
  using (public.can_edit_book(book_id));

-- public.collaborator_invites
drop policy if exists "invites manage by editor" on public.collaborator_invites;
create policy "invites insert by editor" on public.collaborator_invites for insert
  with check (public.can_edit_book(book_id));
create policy "invites update by editor" on public.collaborator_invites for update
  using (public.can_edit_book(book_id))
  with check (public.can_edit_book(book_id));
create policy "invites delete by editor" on public.collaborator_invites for delete
  using (public.can_edit_book(book_id));
