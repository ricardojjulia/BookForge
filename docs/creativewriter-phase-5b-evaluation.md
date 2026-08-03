# CreativeWriter Phase 5B Evaluation

Date: 2026-08-02
Phase: 5B Comment Route Hardening And Permission Audit
Status: Implemented, focused verification passed

## Verdict

Phase 5B should harden the existing reader-comment API before adding richer contributor workflows. Phase 5A made comment triage actionable from CreativeWriter, but the route and RLS contract needed explicit validation, book scoping, and permission evidence.

## Permission Model

- Any authenticated user who can view a book can list its reader comments.
- Any authenticated user who can view a book can create a reader comment on that book.
- A paragraph-scoped reader comment can only target a paragraph that belongs to the same book.
- A comment owner can resolve, reopen, or delete their own comment.
- A book editor, admin, or owner can resolve, reopen, or delete any comment on the book through `can_edit_book`.
- Users without book visibility receive `Book not found.`
- Users who can view a book but do not own the comment and cannot edit the book receive a permission error for mutation.

## Scope

In scope:

- Harden `/api/books/[bookId]/annotations`.
- Harden `/api/books/[bookId]/annotations/[annotationId]`.
- Add Zod validation for PATCH payloads.
- Add route-level book visibility checks before list/create.
- Add route-level paragraph ownership checks before paragraph-scoped create.
- Add route-level comment ownership or book editor checks before resolve/reopen/delete.
- Add RLS update policy for reader annotation owner/editor updates.
- Add focused route tests for auth, invalid payloads, book scoping, paragraph scoping, ownership, editor override, and mutation query scoping.

Out of scope:

- Contributor assignments.
- Suggested edits.
- Approval routing.
- Contributor status sync ledger.
- Notification fanout for comment resolution.
- Offline/local DB comment queues.

## Approval Gates

- Scope approval: hardening only; no new contributor workflow UI.
- API approval: reuse BookForge annotation routes as the CreativeWriter comment bridge.
- Data approval: `reader_annotations.resolved` remains the comment state field.
- Security approval: route checks and RLS update policy enforce the same owner/editor mutation rule.
- Verification approval: focused route tests, scoped lint, local migration application, policy proof, broader CreativeWriter tests, diff check, and typecheck status are recorded.

## Implementation Notes

- `POST /api/books/[bookId]/annotations` now validates body input, verifies book visibility, and rejects paragraph IDs that do not belong to the book.
- `GET /api/books/[bookId]/annotations` now verifies book visibility and propagates annotation query errors.
- `PATCH /api/books/[bookId]/annotations/[annotationId]` now accepts only boolean `resolved` values.
- `PATCH` and `DELETE` first load the comment by both `annotationId` and `bookId`.
- Non-owner comment mutations require `can_edit_book`.
- Migration `202608020005_reader_annotation_update_policy.sql` replaces the prior editor-only update policy with an owner-or-editor update policy.

## Verification Evidence

- Passed: `npx vitest run 'src/app/api/books/[bookId]/annotations/route.test.ts' 'src/app/api/books/[bookId]/annotations/[annotationId]/route.test.ts'`
- Result: 2 test files passed, 13 tests passed.
- Passed: scoped ESLint for annotation route and annotation route test files.
- Passed: `supabase migration up --local`
- Local policy proof: `pg_policies` shows `annotations update own or editor` with owner-or-`can_edit_book(book_id)` `using` and `with check` expressions.
- Local migration history proof: `202608020005|reader_annotation_update_policy` exists in `supabase_migrations.schema_migrations`.
- Passed: `npx vitest run 'src/app/api/books/[bookId]/annotations/route.test.ts' 'src/app/api/books/[bookId]/annotations/[annotationId]/route.test.ts' src/components/creativewriter/creativewriter-workspace.test.tsx src/lib/creativewriter-ui/dashboard.test.ts src/lib/creativewriter-sync.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts`
- Result: 7 test files passed, 35 tests passed.
- Passed: full scoped ESLint for annotation routes/tests plus CreativeWriter workspace/dashboard files.
- Passed: `git diff --check`
- Passed: `curl -I http://localhost:4747/creativewriter` returned 200 from the running local dev server.
- Passed: unauthenticated API smoke for `GET /api/books/book-1/annotations` returned 401 `Authentication required.`
- Browser smoke: `npx --yes agent-browser open http://localhost:4747/creativewriter` loaded without a Next.js error overlay, but the automation browser session was signed out and only exposed the public nav/sign-in state.
- Blocked by unrelated existing generated route and route-test typing errors: `npx tsc --noEmit`

## Remaining Risks

- Comment resolution is still not part of the CreativeWriter sync ledger.
- Cloud Supabase migration execution is not proven by this local slice.
- Contributor roles are still broad BookForge book roles, not a dedicated reviewer-role system.
- Route tests mock Supabase behavior; they do not replace live cross-account RLS tests.
- Typecheck remains blocked by unrelated existing generated route and route-test typing errors outside the Phase 5B files.

## Next Phase

Proceed to **Phase 5C Contributor Suggestions Contract** after deciding whether suggestions should live in `reader_annotations`, a dedicated suggestions table, or the CreativeWriter sync ledger. The safer product path is a dedicated suggestions contract because suggestions need accept/reject/apply semantics that comments do not.
