# CreativeWriter Phase 5K Evaluation

Date: 2026-08-03
Phase: Durable Contributor Assignment Contract
Status: Implemented, verification passed with unrelated typecheck blockers

## Scope

Phase 5K adds the durable contributor assignment contract and read-only CreativeWriter visibility. It intentionally stops before in-app assignment editing controls and assignee status mutation UI.

## Implementation

- Added `creativewriter_contributor_assignments` table with book/chapter/paragraph scope, assignee, assigner, status, title, note, due date, and lifecycle timestamps.
- Added book-scoped RLS policies for viewing, editor creation/management, assignee status updates, and editor deletion.
- Added authenticated assignment list/create API at `GET` and `POST /api/books/[bookId]/assignments`.
- Validated create payloads, book edit access, assignee book membership, and optional chapter/paragraph scoping.
- Loaded assignments into the CreativeWriter workspace data mapper with missing-table fallback during rollout.
- Included assignment participants in the best-effort profile lookup.
- Added read-only assignment queue and active assignment counts to the CreativeWriter Suggestions tab.
- Added focused route, mapper, and component tests.

## Decisions

| Decision | Rationale |
|---|---|
| Create a dedicated assignment table. | Assignments need durable lifecycle state distinct from comments and suggestions. |
| Keep assignment UI read-only in this slice. | Creation/status controls need a follow-up UX and permission pass. |
| Allow assignee status updates in RLS. | The contract should support future assignee progress updates without granting full book edit rights. |
| Validate assignee membership in the route. | Editors should not assign work to unrelated accounts. |
| Use missing-table fallback in the mapper. | The UI can deploy safely before every environment has the migration applied. |

## Verification

- `npx vitest run 'src/app/api/books/[bookId]/assignments/route.test.ts' src/lib/creativewriter-ui/dashboard.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
  - Result: Passed, 3 test files, 28 tests.
- `npx vitest run 'src/app/api/books/[bookId]/assignments/route.test.ts' 'src/app/api/books/[bookId]/suggestions/route.test.ts' 'src/app/api/books/[bookId]/suggestions/[suggestionId]/route.test.ts' 'src/app/api/books/[bookId]/annotations/route.test.ts' 'src/app/api/books/[bookId]/annotations/[annotationId]/route.test.ts' src/components/creativewriter/creativewriter-workspace.test.tsx src/lib/creativewriter-ui/dashboard.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts`
  - Result: Passed, 11 test files, 71 tests.
- `npx eslint 'src/app/api/books/[bookId]/assignments/route.ts' 'src/app/api/books/[bookId]/assignments/route.test.ts' src/lib/creativewriter-ui/dashboard.ts src/lib/creativewriter-ui/dashboard.test.ts src/components/creativewriter/creativewriter-workspace.tsx src/components/creativewriter/creativewriter-workspace.test.tsx`
  - Result: Passed.
- `git diff --check`
  - Result: Passed.
- `supabase migration up --local --include-all`
  - Result: Passed; migration `202608020010` applied locally.
- Local database proof:
  - Result: `public.creativewriter_contributor_assignments` exists and `supabase_migrations.schema_migrations` includes `202608020010`.
- `curl -I http://localhost:4747/creativewriter`
  - Result: Passed, HTTP 200.
- `curl -i http://localhost:4747/api/books/book-1/assignments`
  - Result: Passed, HTTP 401 with `Authentication required.`
- `npx --yes agent-browser open http://localhost:4747/creativewriter && npx --yes agent-browser wait --load networkidle && npx --yes agent-browser snapshot -i`
  - Result: Passed signed-out browser smoke; public nav and Sign In rendered with no Next.js error overlay.
- `npx tsc --noEmit`
  - Result: Blocked by unrelated existing generated route and route-test typing errors in `.next/types/validator.ts`, auto-review, chat, export, rewrite-workflow, and revisions review-workflow tests.

## Remaining Risks

- Assignment creation controls are not yet exposed in CreativeWriter.
- Assignee status update UI and API patch semantics remain future work.
- Cross-account cloud Supabase RLS proof is still required before beta.
- Assignment notifications are not implemented.
