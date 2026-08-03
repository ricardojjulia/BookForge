drop policy if exists "annotations resolve editor" on public.reader_annotations;
drop policy if exists "annotations update own or editor" on public.reader_annotations;

create policy "annotations update own or editor"
  on public.reader_annotations
  for update
  using ((select auth.uid()) = annotator_id or public.can_edit_book(book_id))
  with check ((select auth.uid()) = annotator_id or public.can_edit_book(book_id));
