-- Atomic per-paragraph claim for rewrite-execute's chunked continuation
-- calls. Same class of race as generate-draft's chapter-status claim
-- (see that route's "Atomic claim" comment): this route self-chains via
-- after() the instant a chunk finishes, AND the browser's own
-- runChunkedJob driver calls back in with the same jobId -- normally
-- harmless, but if the client's follow-up gets delayed (e.g. a mobile tab
-- backgrounded by a screen lock) it can land while the self-chained
-- request is still mid-flight. Unlike chapters, paragraphs have no
-- "planned" status field to flip -- eligibility is derived purely from
-- the absence of a revision_versions row, and there's no unique
-- constraint on revision_versions.paragraph_id, so a concurrent double
-- claim wouldn't throw: it would just silently insert two revision_versions
-- rows for the same paragraph (duplicate spend, not a hard failure). This
-- column is a lightweight, dedicated in-flight lock.
alter table paragraphs add column if not exists rewrite_claim_job_id uuid;

create index if not exists paragraphs_rewrite_claim_job_id_idx
  on paragraphs (rewrite_claim_job_id)
  where rewrite_claim_job_id is not null;
