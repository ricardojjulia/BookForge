# CreativeWriter Phase 5J Evaluation

Date: 2026-08-03
Phase: Profile-Safe Contributor Labels
Status: Implemented, verification passed with unrelated typecheck blockers

## Scope

Phase 5J restores human-readable contributor labels without reintroducing the runtime failure caused by embedded `profiles(...)` selection from the collaborator query.

## Implementation

- Kept the `book_collaborators` query limited to `user_id`, `role`, and `created_at`.
- Added `participantProfiles` to the CreativeWriter workspace payload.
- Collected participant IDs from collaborators, reader comments, contributor suggestion proposers/reviewers, and the current account.
- Added a separate best-effort `profiles` query for `id,display_name`.
- Ignored profile lookup errors so labels never block CreativeWriter workspace loading.
- Used visible profile display names in the contributor workload panel, while preserving `You` and shortened contributor ID fallbacks.
- Added mapper and component fixture coverage for profile-safe labels.

## Decisions

| Decision | Rationale |
|---|---|
| Do not embed `profiles(...)` in `book_collaborators`. | The relationship is not guaranteed in the runtime schema and caused workspace load failure. |
| Keep profile lookup best-effort. | Profile visibility is constrained by existing RLS; missing labels should not break CreativeWriter. |
| Do not change profile RLS in this slice. | Broader contributor identity visibility needs a separate security review. |
| Keep email nullable. | The base `profiles` schema only guarantees `display_name`. |

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

- Other contributors may still appear as shortened IDs unless profile RLS exposes their display names.
- Full collaborator identity display needs a future policy/API design for safe profile visibility.
- Contributor labels are display-only; durable assignments and contributor status sync remain unimplemented.
