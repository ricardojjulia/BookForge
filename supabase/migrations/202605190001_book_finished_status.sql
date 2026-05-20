alter table public.books
  add column if not exists finished_export_id uuid references public.exports(id) on delete set null;
