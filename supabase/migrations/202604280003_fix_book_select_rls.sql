drop policy if exists "books view access" on public.books;
drop policy if exists "books edit access" on public.books;
drop policy if exists "books owner admin delete" on public.books;

create policy "books view access" on public.books
for select
using (
  owner_id = auth.uid()
  or public.has_book_role(id, array['viewer','editor','admin'])
);

create policy "books edit access" on public.books
for update
using (
  owner_id = auth.uid()
  or public.has_book_role(id, array['editor','admin'])
)
with check (
  owner_id = auth.uid()
  or public.has_book_role(id, array['editor','admin'])
);

create policy "books owner admin delete" on public.books
for delete
using (
  owner_id = auth.uid()
  or public.has_book_role(id, array['admin'])
);
