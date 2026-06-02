-- Auto-review telemetry enrichment
--
-- Adds book_stats: a snapshot of manuscript size captured at run start.
-- This lets the analytics dashboard correlate run duration with book size
-- without querying the live paragraphs/chapters tables (which change over time).
--
-- The existing log jsonb[] column is now expected to hold structured TelemetryEntry
-- objects instead of plain strings. Each entry shape:
--
--   type           : 'stage_complete' | 'stage_error' | 'info'
--   stage          : stage ID, e.g. 'analyze', 'critic_baseline:story_structure'
--   iteration      : 0-based rewrite loop index
--   message        : human-readable description (shown in the runner terminal)
--   durationMs     : wall-clock time for this stage in ms (stage_complete entries only)
--   scores         : { [lens]: score } post-rewrite critic scores (critics_check entries)
--   baselineScores : { [lens]: score } baseline critic scores (first critics_check only)
--   metadata       : { model?, batchCount?, accepted?, rejected? } arbitrary extra context
--   ts             : ISO 8601 timestamp, appended server-side by the PATCH handler
--
-- book_stats shape:
--   chapters   : number of chapters at run start
--   paragraphs : number of paragraphs at run start
--   (word count is estimated client-side as paragraphs * 65)

ALTER TABLE public.auto_review_jobs
  ADD COLUMN IF NOT EXISTS book_stats jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.auto_review_jobs.book_stats IS
  'Snapshot of manuscript size captured when the job was created: '
  '{ chapters: number, paragraphs: number }. '
  'Used by analytics to correlate run time with book size.';

COMMENT ON COLUMN public.auto_review_jobs.log IS
  'Structured telemetry log (jsonb[]). Each entry: '
  '{ type, stage?, iteration, message, durationMs?, scores?, baselineScores?, metadata?, ts }. '
  'type is stage_complete | stage_error | info. '
  'ts is appended server-side by the PATCH handler.';

COMMENT ON COLUMN public.auto_review_jobs.iteration IS
  'Number of completed rewrite loop cycles beyond the first (0 = ran once, 1 = looped once).';

COMMENT ON COLUMN public.auto_review_jobs.mode IS
  'Run mode selected in the wizard: '
  'full_review (humanized literary rewrite), '
  'make_shorter (50% compression via downsize_abridge strategy), '
  'make_longer (40% expansion via creative_enhancement strategy).';

COMMENT ON COLUMN public.auto_review_jobs.stages_completed IS
  'Ordered list of stage IDs that have completed (done or skipped). '
  'Used to resume a job and to drive the progress bar.';

COMMENT ON COLUMN public.auto_review_jobs.config IS
  'Run configuration: { reviewStrategy, model? }. '
  'model is populated at run start from the active LM Studio model.';
