# CreativeWriter Phase 5I Evaluation

Date: 2026-08-03
Phase: Contributor Roster and Workload Visibility
Status: Implemented, verification passed with unrelated typecheck blockers

## Scope

Phase 5I adds read-only contributor coordination visibility to CreativeWriter. It loads existing BookForge collaborators for the selected book and derives workload counts from reader comments and contributor suggestions.

## Implementation

- Added `CreativeWriterContributorView` to the workspace data contract.
- Loaded `book_collaborators` with role and joined timestamp for the selected book.
- Added a Contributors panel to the Suggestions tab.
- Derived open comment, proposed suggestion, reviewed suggestion, applied suggestion, and latest activity counts per person.
- Included activity-only participants when existing comments or suggestions reference a user who is not in the loaded collaborator roster.
- Added mapper and component test coverage for contributor roster loading and workload rendering.

## Decisions

| Decision | Rationale |
|---|---|
| Reuse `book_collaborators` first. | It is the existing source of contributor membership and role authority. |
| Do not embed `profiles` from this query. | The runtime schema does not guarantee a PostgREST relationship from collaborators to profiles. |
| Keep this slice read-only. | Durable assignments need their own lifecycle, permissions, sync behavior, and conflict model. |
| Derive workload from loaded comments and suggestions. | Reviewers need coordination visibility before a full assignment system exists. |
| Include activity-only users. | Historical comments and suggestions may reference users not present in the current collaborator roster. |

## Verification

- `npx vitest run src/lib/creativewriter-ui/dashboard.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
  - Result: Passed, 2 test files, 20 tests.
- `npx vitest run 'src/app/api/books/[bookId]/suggestions/route.test.ts' 'src/app/api/books/[bookId]/suggestions/[suggestionId]/route.test.ts' 'src/app/api/books/[bookId]/annotations/route.test.ts' 'src/app/api/books/[bookId]/annotations/[annotationId]/route.test.ts' src/components/creativewriter/creativewriter-workspace.test.tsx src/lib/creativewriter-ui/dashboard.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts`
  - Result: Passed, 10 test files, 63 tests.
- `npx eslint src/lib/creativewriter-ui/dashboard.ts src/lib/creativewriter-ui/dashboard.test.ts src/components/creativewriter/creativewriter-workspace.tsx src/components/creativewriter/creativewriter-workspace.test.tsx 'src/app/api/books/[bookId]/suggestions/[suggestionId]/route.ts' 'src/app/api/books/[bookId]/suggestions/[suggestionId]/route.test.ts'`
  - Result: Passed.
- `git diff --check`
  - Result: Passed.
- `curl -I http://localhost:4747/creativewriter`
  - Result: Passed, HTTP 200.
- `curl -i http://localhost:4747/api/books/book-1/suggestions`
  - Result: Passed, HTTP 401 with `Authentication required.`
- `npx --yes agent-browser open http://localhost:4747/creativewriter && npx --yes agent-browser wait --load networkidle && npx --yes agent-browser snapshot -i`
  - Result: Passed signed-out browser smoke; public nav and Sign In rendered with no Next.js error overlay.
- `npx tsc --noEmit`
  - Result: Blocked by unrelated existing generated route and route-test typing errors in `.next/types/validator.ts`, auto-review, chat, export, rewrite-workflow, and revisions review-workflow tests.

## Remaining Risks

- Contributor workload is derived from the currently loaded book data and is not a durable assignment ledger.
- Chapter/paragraph assignment, due dates, explicit contributor statuses, and synced assignment state remain unimplemented.
- Display/email labels remain nullable until a profile-safe lookup is added.
