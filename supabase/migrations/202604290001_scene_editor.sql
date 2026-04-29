alter table public.scenes add column if not exists title text;

create index if not exists scenes_book_chapter_number_idx
  on public.scenes (book_id, chapter_id, scene_number);
