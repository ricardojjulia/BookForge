alter table public.chapters
  add column if not exists section_type text not null default 'body'
    check (section_type in ('front_matter', 'body', 'back_matter')),
  add column if not exists exclude_from_rewrite boolean not null default false,
  add column if not exists exclude_from_export boolean not null default false,
  add column if not exists structure_notes text;

create index if not exists chapters_book_section_idx
  on public.chapters (book_id, section_type, chapter_number);
