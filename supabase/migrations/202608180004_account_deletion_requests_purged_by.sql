-- Tracks which Steward performed a purge (scheduled or force-delete), distinct
-- from restored_by (which records who restored an account). Not an FK to
-- auth.users for the same reason user_id isn't one: the acting Steward's own
-- account could theoretically be deleted later, and that shouldn't cascade
-- away this audit row.
alter table public.account_deletion_requests
  add column purged_by uuid;
