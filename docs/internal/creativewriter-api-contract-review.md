# CreativeWriter API Contract Review

Date: 2026-08-02
Phase: 3R Factory Hardening
Status: Drafted with critical fixes applied

## Contract Surface

CreativeWriter remains BookForge-aware but not Supabase-aware. Desktop clients interact with BookForge through authenticated API routes only.

Current routes:

- `GET /api/books/[bookId]/creativewriter-package`
- `POST /api/creativewriter/packages`
- `POST /api/creativewriter/import`
- `POST /api/creativewriter/sync/link`
- `POST /api/creativewriter/sync/pull`
- `POST /api/creativewriter/sync/push`

## Required Invariants

- Every route requires an authenticated BookForge user.
- CreativeWriter clients never receive Supabase service credentials.
- Package upload and import must validate package structure before row insertion.
- Push requests must bind the local project account to the authenticated user.
- Stale local versions must produce conflicts instead of overwriting cloud text.
- Unsupported write operations must be rejected per change, not applied silently.

## Phase 3R Findings

| ID | Severity | Finding | Action |
| --- | --- | --- | --- |
| API-001 | High | `POST /api/creativewriter/import` accepted arbitrary `source` values through a type cast. | Added runtime source validation. |
| API-002 | High | `.bookforge.json` uploads were parsed but not revalidated against the package schema. | Added schema validation before returning uploaded packages. |
| API-003 | Medium | Import payloads had no explicit file count, per-file size, archive entry, or extracted text limits. | Added bounded import limits. |
| API-004 | Medium | Sync link route lacked direct route tests. | Added authenticated and unauthenticated route coverage. |

## Accepted Contract Gaps

- Sync cursors are timestamp-derived and not backed by a durable sync ledger yet.
- Pull does not currently use `sinceCursor` to return deltas only.
- Create, delete, reorder, and revision accept/reject operations are rejected until the client and cloud conflict model are ready.
- Import is best-effort for third-party writing tools and does not promise full-fidelity migration.

## Exit Criteria

- Critical runtime validation findings are fixed.
- Link, pull, push, import, package upload, and package download routes have focused tests.
- The remaining gaps are documented as non-GA limitations.
