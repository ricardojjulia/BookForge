# CreativeWriter Phase 5O Evaluation

Date: 2026-08-04
Phase: Scheduled Assignment Due-Soon Reminders
Status: Implemented, local database and focused verification passed with unrelated typecheck blockers

## Scope

Phase 5O adds scheduled coverage for active contributor assignments entering the next 72 hours. It persists in-app reminders atomically, shares canonical deduplication keys with immediate Phase 5N events, optionally sends email, and exposes a secret-protected endpoint for an external hourly scheduler.

This phase does not add an email retry queue, reminder preferences, a provider-specific scheduler file, persistent scheduler telemetry, or a user-facing operations dashboard.

## Implementation

- Added nullable notification deduplication keys and a partial unique index by recipient, event, and key.
- Added a service-role-only `SECURITY DEFINER` function that locks eligible assignments, excludes prior claims before limiting, and atomically inserts up to 100 in-app reminders.
- Excluded completed, cancelled, and overdue assignments from scheduled claims.
- Canonicalized immediate and scheduled assignment/deadline keys as UTC ISO timestamps with millisecond precision.
- Added an internal route protected by configured `CRON_SECRET` bearer authentication using constant-time comparison.
- Added bounded optional email delivery in groups of ten after in-app reminders persist.
- Returned `notified`, `emailsSent`, and `hasMore` so external schedulers can drain additional batches.
- Documented server-only credentials and the platform-neutral hourly scheduler contract.

## Council Decisions

| Decision | Rationale |
|---|---|
| Claim and insert reminders in one database function. | Database locking and uniqueness close cross-request races without relying on process memory. |
| Exclude prior claims before applying the limit. | Already-deduplicated early deadlines cannot permanently starve assignment 101. |
| Use the same canonical key for immediate and scheduled events. | The scheduled safety net cannot duplicate an event-driven reminder for the same assignment deadline. |
| Keep optional email after durable in-app insertion. | An email outage cannot erase the in-app reminder or make assignment persistence fail. |
| Bound email concurrency at ten. | Avoids fully serial delivery while limiting provider and database pressure. |
| Keep scheduling platform-neutral. | The repository does not declare one production deployment provider. |
| Report continuation instead of unbounded request work. | Schedulers can drain large windows while each invocation remains bounded. |

## Verification

- Phase 5O focused tests: 4 files, 13 tests passed.
- Broader Phase 5M-5O regression suite: 8 files, 57 tests passed.
- Scoped ESLint across reminder, notification, workflow, and internal route files: passed.
- Editor diagnostics for Phase 5O source files: no errors.
- Local migration application: passed.
- Local Postgres catalog proof:
  - Partial unique index exists on `(recipient_user_id, event_type, dedupe_key)` where the key is non-null.
  - Claim function is `SECURITY DEFINER`.
  - Execute privilege is limited to the function owner and `service_role`.
- Rollback-only database behavior probe:
  - First synthetic assignment claim returned one reminder.
  - Repeating the same claim returned zero reminders.
  - The key used canonical `2050-01-02T12:00:00.000Z` formatting.
  - Transaction rolled back; no probe data persisted.
- `npx tsc --noEmit`:
  - Phase 5O files have no diagnostics.
  - Project check remains blocked by the same 12 unrelated generated validator and existing route-test errors recorded in Phase 5N.

## Remaining Risks

- Optional email failure is logged but not queued independently for retry; the durable in-app reminder remains available.
- External deployment must configure the hourly scheduler, `CRON_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY`.
- `hasMore` is conservative when exactly 100 rows are claimed and can cause one harmless empty continuation call.
- Persistent scheduler run telemetry and missed-run alerting remain future operations work.
- Cross-account cloud Supabase RLS and deployment evidence remain required before beta.
