# CreativeWriter Phase 4A Evaluation

Date: 2026-08-02
Phase: 4A Durable Sync Ledger
Status: Implemented as prerequisite before UI

## Factory Decision

Phase 4 should not proceed directly to CreativeWriter UI yet. Phase 3R found that sync state was not durable enough for user-facing editor work. The inserted Phase 4A adds a cloud ledger so link state, push outcomes, conflicts, rejections, and idempotency keys survive beyond a single API response.

## Implemented Scope

- Added `creativewriter_sync_projects` for account/book/local-project links.
- Added `creativewriter_sync_events` for applied, conflict, and rejected push outcomes.
- Added RLS policies using BookForge `can_view_book` and `can_edit_book` helpers.
- Upsert linked project state on link/pull and after push.
- Check prior idempotency keys before applying a cloud mutation.
- Persist applied, rejected, and conflict outcomes.
- Added focused tests for ledger recording and idempotent retry behavior.

## Review Result

Proceeding to UI is now more defensible, but only for an internal/local prototype. Before beta, the factory should still add:

- conflict resolution endpoint,
- conflict review UI contract,
- monotonic entity-version ledger or comparable version guarantee,
- cloud migration rehearsal evidence,
- entitlement checks for CreativeWriter access,
- import job isolation for large uploads.

## Recommendation

Next phase should be **Phase 4B Conflict Resolution Contract**, not the full UI. The reason is practical: a writing UI that can create conflicts needs a reliable way to display and resolve them. After Phase 4B, proceed to a minimal CreativeWriter UI slice with chapter tree, manuscript editor, save queue, and sync status.
