create policy "revision jobs delete edit"
  on public.revision_jobs
  for delete
  using (public.can_edit_book(book_id));

create policy "revision versions delete edit"
  on public.revision_versions
  for delete
  using (public.can_edit_book(book_id));

create policy "reports delete edit"
  on public.coherence_reports
  for delete
  using (public.can_edit_book(book_id));
