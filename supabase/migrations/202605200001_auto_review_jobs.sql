-- Auto-review jobs: tracks the state of fully-automated wizard runs
CREATE TABLE IF NOT EXISTS public.auto_review_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('full_review', 'make_shorter', 'make_longer')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  current_stage text NOT NULL DEFAULT 'init',
  stages_completed text[] NOT NULL DEFAULT '{}',
  iteration integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}',
  log jsonb[] NOT NULL DEFAULT '{}',
  export_id uuid REFERENCES public.exports(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.auto_review_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own auto_review_jobs"
  ON public.auto_review_jobs FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX auto_review_jobs_book_id_idx ON public.auto_review_jobs(book_id);
CREATE INDEX auto_review_jobs_user_id_idx ON public.auto_review_jobs(user_id);
