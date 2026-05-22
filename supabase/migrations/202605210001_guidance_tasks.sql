-- Tracks the author's progress on each item in a humanized_guidance report.
-- One row per item per report; upserted by (report_id, item_key).

CREATE TABLE IF NOT EXISTS public.guidance_tasks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id     uuid        NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  report_id   uuid        NOT NULL REFERENCES public.coherence_reports(id) ON DELETE CASCADE,
  item_key    text        NOT NULL,   -- e.g. "priority:0", "action:2"
  status      text        NOT NULL DEFAULT 'todo'
                          CHECK (status IN ('todo', 'in_progress', 'done', 'skipped')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, item_key)
);

ALTER TABLE public.guidance_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own guidance tasks"
  ON public.guidance_tasks
  USING (
    book_id IN (
      SELECT id FROM public.books WHERE owner_id = auth.uid()
    )
  );
