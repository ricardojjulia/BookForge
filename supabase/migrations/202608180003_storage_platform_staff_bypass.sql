-- Storage bucket policies check literal path-prefix ownership, structurally
-- unrelated to has_book_role, so the platform-staff bypass there doesn't reach
-- Storage. Add it here too so "full cross-book management" covers uploads/exports,
-- not just database rows.

drop policy if exists "manuscripts own path read" on storage.objects;
create policy "manuscripts own path read" on storage.objects for select
  using (bucket_id = 'manuscripts' and ((select auth.uid())::text = (storage.foldername(name))[1] or public.is_platform_staff()));

drop policy if exists "manuscripts own path write" on storage.objects;
create policy "manuscripts own path write" on storage.objects for insert
  with check (bucket_id = 'manuscripts' and ((select auth.uid())::text = (storage.foldername(name))[1] or public.is_platform_staff()));

drop policy if exists "exports own path read" on storage.objects;
create policy "exports own path read" on storage.objects for select
  using (bucket_id = 'exports' and ((select auth.uid())::text = (storage.foldername(name))[1] or public.is_platform_staff()));

drop policy if exists "exports own path write" on storage.objects;
create policy "exports own path write" on storage.objects for insert
  with check (bucket_id = 'exports' and ((select auth.uid())::text = (storage.foldername(name))[1] or public.is_platform_staff()));

drop policy if exists "covers own path read" on storage.objects;
create policy "covers own path read" on storage.objects for select
  using (bucket_id = 'covers' and ((select auth.uid())::text = (storage.foldername(name))[1] or public.is_platform_staff()));

drop policy if exists "covers own path write" on storage.objects;
create policy "covers own path write" on storage.objects for insert
  with check (bucket_id = 'covers' and ((select auth.uid())::text = (storage.foldername(name))[1] or public.is_platform_staff()));

drop policy if exists "references own path read" on storage.objects;
create policy "references own path read" on storage.objects for select
  using (bucket_id = 'references' and ((select auth.uid())::text = (storage.foldername(name))[1] or public.is_platform_staff()));

drop policy if exists "references own path write" on storage.objects;
create policy "references own path write" on storage.objects for insert
  with check (bucket_id = 'references' and ((select auth.uid())::text = (storage.foldername(name))[1] or public.is_platform_staff()));

drop policy if exists "style samples own path read" on storage.objects;
create policy "style samples own path read" on storage.objects for select
  using (bucket_id = 'style-samples' and ((select auth.uid())::text = (storage.foldername(name))[1] or public.is_platform_staff()));

drop policy if exists "style samples own path write" on storage.objects;
create policy "style samples own path write" on storage.objects for insert
  with check (bucket_id = 'style-samples' and ((select auth.uid())::text = (storage.foldername(name))[1] or public.is_platform_staff()));
