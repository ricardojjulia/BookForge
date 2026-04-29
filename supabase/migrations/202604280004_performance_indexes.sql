create index if not exists paragraphs_book_chapter_number_idx
  on public.paragraphs (book_id, chapter_id, paragraph_number);

create index if not exists revision_versions_book_paragraph_created_idx
  on public.revision_versions (book_id, paragraph_id, created_at desc);

create index if not exists revision_versions_book_pending_idx
  on public.revision_versions (book_id, paragraph_id)
  where accepted = false and rejected = false;

create index if not exists revision_jobs_book_status_created_idx
  on public.revision_jobs (book_id, status, created_at desc);

create index if not exists coherence_reports_book_type_created_idx
  on public.coherence_reports (book_id, report_type, created_at desc);

create index if not exists exports_book_created_idx
  on public.exports (book_id, created_at desc);
