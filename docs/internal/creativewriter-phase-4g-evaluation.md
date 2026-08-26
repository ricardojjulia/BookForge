# CreativeWriter Phase 4G Evaluation

Date: 2026-08-02
Status: Implemented, focused verification passed

## Purpose

Phase 4G adds read-only BookForge context panels to the CreativeWriter prototype so the writing desk can use existing book metadata while preserving the current manuscript-sync boundary.

## Scope

Implemented:

- Normalized CreativeWriter support context from existing BookForge tables.
- Added Author Notes, Research, and Book Bible panels to the CreativeWriter right rail.
- Kept the conflict queue as the first support tab.
- Surfaced author notes, timeline notes, reference materials, book bible summary, characters, locations, themes, and motifs.
- Added mapper and component regression tests.
- Seeded deterministic local data for browser verification.

Out of scope:

- Editing notes, research, or bible entries from CreativeWriter.
- Syncing non-manuscript support entities from an offline database.
- Structural create/delete/reorder editing.
- Subscription entitlement enforcement.
- Cloud Supabase deployment proof.

## Decisions

- Keep support panels read-only for this phase. BookForge remains the source of truth for notes, research, and bible data until non-manuscript sync semantics are designed.
- Normalize Supabase rows in `src/lib/creativewriter-ui/dashboard.ts` before passing data to the client component.
- Treat missing optional support tables as empty context only when Supabase reports the same schema-cache missing-table class already tolerated for the CreativeWriter ledger.
- Use one right-rail tab group for conflicts, notes, research, and bible context to keep manuscript focus intact.

## Verification Evidence

- Passed: `npx vitest run src/lib/creativewriter-ui/dashboard.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 2 test files passed, 9 tests passed.
- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts src/lib/creativewriter-import/import.test.ts src/lib/creativewriter-ui/dashboard.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts src/app/api/creativewriter/import/route.test.ts src/app/api/creativewriter/sync/link/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 14 test files passed, 47 tests passed.
- Passed: scoped ESLint for CreativeWriter dashboard and workspace files.
- Browser proof: authenticated as `demo@bookforge.local`, opened `http://localhost:4747/creativewriter?bookId=4d000000-0000-4000-8000-000000000002`, verified the selected book and chapter, clicked Notes, Research, and Bible tabs, and confirmed seeded support context rendered without a Next.js error overlay.
- Database proof: local Supabase returned seeded Phase 4G support rows for `author_notes`, `reference_materials`, and `characters`.
- Typecheck remains blocked by unrelated existing route-test typing errors outside CreativeWriter Phase 4G files.

## Residual Risks

- Support panels are read-only and do not yet participate in local offline sync.
- The UI summarizes arbitrary book bible JSON rather than rendering every possible nested structure.
- Large reference libraries need pagination/search before this becomes production-grade.
- Cloud Supabase and entitlement behavior remain unverified for CreativeWriter.

## Recommendation

Proceed to **Phase 4H Support Context Ergonomics** for search/filter/pinning and better bible rendering, or insert **Phase 4F-R Structural Conflict Design** before any manuscript create/delete/reorder operations.
