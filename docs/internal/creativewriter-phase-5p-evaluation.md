# CreativeWriter Phase 5P Evaluation

Date: 2026-08-04
Phase: Durable Collaboration Notification Email Retries
Status: Implemented, local database and focused verification passed with unrelated typecheck blockers

## Scope

Phase 5P prevents transient optional email failures from being lost after collaboration notifications persist. Every collaboration notification creates one durable email-delivery intent, immediate delivery records its outcome, and a protected worker retries transient failures with capped backoff.

This phase does not add a deployment-provider scheduler file, a queue operations dashboard, manual dead-letter replay, per-user notification preferences, or cloud deployment evidence.

## Implementation

- Added one unique email-delivery row per collaboration notification through a database trigger.
- Preserved in-app notification and workflow mutation success when provider delivery or queue finalization fails.
- Classified missing recipient email and intentionally disabled email as terminal skipped outcomes.
- Classified provider exceptions and resolved Resend API errors as retryable failures.
- Added capped retry delays of 5 minutes, 15 minutes, 1 hour, and 6 hours, with a five-attempt dead-letter limit.
- Added atomic service-role retry claims with batches of 50, bounded delivery concurrency of 10, continuation reporting, and 15-minute stale-lock recovery.
- Added per-claim UUID leases so stale workers cannot finalize a reclaimed delivery.
- Restricted queue claim and completion functions to `service_role` and revoked direct authenticated table access.
- Added stable notification-based Resend idempotency keys to protect against duplicate provider sends.
- Added a constant-time secret-protected internal retry endpoint and documented five-minute scheduler operation.

## Council Decisions

| Decision | Rationale |
|---|---|
| Create delivery intent with a notification trigger. | Notification persistence and retry intent cannot diverge between application code paths. |
| Keep email and queue finalization best-effort after notification persistence. | Delivery infrastructure cannot turn an already-committed workflow mutation into a false HTTP failure. |
| Restrict completion to the service role. | Notification actors are not trusted authorities for provider delivery state. |
| Fence completion with a per-claim lease token. | A worker whose lock expired cannot overwrite the outcome of the worker that reclaimed the row. |
| Use a stable provider idempotency key. | A provider success followed by process loss can be retried without creating a second provider send. |
| Treat disabled email as skipped rather than failed. | Local or intentionally in-app-only environments must not accumulate futile retries. |
| Cap retries at five attempts. | Permanently invalid provider requests cannot retry forever. |

## Verification

- Phase 5P focused tests: 4 files, 12 tests passed before direct provider coverage.
- Direct provider, workflow, and retry tests: 3 files, 7 tests passed.
- Broader Phase 5M-5P regression suite: 11 files, 67 tests passed.
- Scoped ESLint across Phase 5P source and tests: passed with no warnings.
- Editor diagnostics for Phase 5P source files: no errors.
- `git diff --check`: passed.
- Local migrations `202608040003` and `202608040004`: applied successfully.
- Rollback-only local Postgres probe:
  - A stale lease token could not complete a claimed delivery.
  - The active lease completed the delivery exactly once.
  - A late worker could not reopen terminal sent state.
  - Final state was `sent`, attempt count was one, and `sent_at` was populated.
  - Completion execute privilege was limited to the function owner and `service_role`.
  - The transaction rolled back; no probe data persisted.
- Live route smoke at `http://127.0.0.1:4747/api/internal/collaboration/email-retries`:
  - Returned `503` with the expected fail-closed configuration response because the running development server has no `CRON_SECRET`.
- `npx tsc --noEmit`:
  - Phase 5P files have no errors.
  - Project check remains blocked by the same 12 unrelated generated validator and existing route-test errors recorded in Phase 5O.

## Remaining Risks

- Production must configure `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and a five-minute external scheduler call.
- Dead-letter deliveries are durable but do not yet have an operations dashboard, alert, or manual replay control.
- Scheduler run history and missed-run alerting are not persisted.
- Resend idempotency is relied on for the narrow provider-success/process-loss window; another provider would need an equivalent contract.
- Cloud Supabase deployment and cross-account authorization evidence remain required before beta.
