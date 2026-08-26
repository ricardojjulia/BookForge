# CreativeWriter Phase 5C Evaluation

Date: 2026-08-02
Phase: 5C Contributor Suggestions Contract
Status: Implemented, focused verification passed

## Verdict

Suggestions need a dedicated contract instead of being overloaded into reader comments. Comments capture feedback. Suggestions propose a manuscript change and therefore need target scope, original text evidence, suggested replacement text, rationale, lifecycle status, reviewer identity, and timestamps.

This slice implements contract, persistence, RLS, and API routes only. CreativeWriter UI for suggestions remains a later phase.

## Lifecycle

- `proposed`: created by a book viewer.
- `withdrawn`: proposer or book editor/admin/owner withdrew a proposed suggestion.
- `accepted`: book editor/admin/owner accepted a proposed suggestion.
- `rejected`: book editor/admin/owner rejected a proposed suggestion.
- `applied`: book editor/admin/owner marked the suggestion applied.
- `superseded`: book editor/admin/owner marked the suggestion replaced by later work.

Only `proposed` suggestions can transition in this first contract slice.

## Permission Model

- Any authenticated user who can view a book can list suggestions for that book.
- Any authenticated user who can view a book can propose a suggestion.
- Suggestions can target a book, chapter, paragraph, or chapter-plus-paragraph scope.
- Chapter targets must belong to the same book.
- Paragraph targets must belong to the same book.
- A proposer can withdraw their own proposed suggestion.
- A book editor, admin, or owner can accept, reject, withdraw, mark applied, or supersede a proposed suggestion.
- Non-editor proposers cannot accept, reject, mark applied, or supersede their own suggestions.

## Scope

In scope:

- `creativewriter_contributor_suggestions` table.
- RLS policies for view, create, and update.
- Suggestion list route.
- Suggestion create route.
- Suggestion status transition route.
- Focused route tests for auth, visibility, target scoping, create payloads, proposer withdrawal, editor review, non-editor denial, immutable non-proposed statuses, and mutation query scoping.
- Local migration application and policy proof.

Out of scope:

- CreativeWriter suggestion UI.
- Applying suggestion text to manuscript paragraphs.
- Suggestion conflict resolution against stale paragraph text.
- Notifications.
- Dedicated reviewer roles beyond existing book viewer/editor/admin roles.
- Offline/local DB suggestion queue.
- Cloud Supabase migration execution.

## Approval Gates

- Scope approval: contract and persistence only; no UI or manuscript mutation.
- Data approval: suggestions are separate from `reader_annotations`.
- Security approval: RLS and API routes enforce book visibility, proposer identity, and editor review permissions.
- Lifecycle approval: only proposed suggestions can transition in this slice.
- Verification approval: focused route tests, scoped lint, local migration application, policy proof, broader CreativeWriter route tests, diff check, and typecheck status are recorded.

## Verification Evidence

- Passed: `npx vitest run 'src/app/api/books/[bookId]/suggestions/route.test.ts' 'src/app/api/books/[bookId]/suggestions/[suggestionId]/route.test.ts'`
- Result: 2 test files passed, 13 tests passed.
- Passed: scoped ESLint for suggestion route and suggestion route test files.
- Passed: `supabase migration up --local`
- Local table proof: `creativewriter_contributor_suggestions` has book/chapter/paragraph target fields, proposer/reviewer fields, lifecycle status, original/suggested text fields, rationale/review note fields, and lifecycle timestamps.
- Local policy proof: `pg_policies` shows view, create, and update policies for `creativewriter_contributor_suggestions`.
- Local migration history proof: `202608020006|creativewriter_contributor_suggestions` exists in `supabase_migrations.schema_migrations`.
- Passed: `npx vitest run 'src/app/api/books/[bookId]/suggestions/route.test.ts' 'src/app/api/books/[bookId]/suggestions/[suggestionId]/route.test.ts' 'src/app/api/books/[bookId]/annotations/route.test.ts' 'src/app/api/books/[bookId]/annotations/[annotationId]/route.test.ts' src/components/creativewriter/creativewriter-workspace.test.tsx src/lib/creativewriter-ui/dashboard.test.ts src/lib/creativewriter-sync.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts`
- Result: 9 test files passed, 48 tests passed.
- Passed: full scoped ESLint for suggestion routes/tests, annotation routes/tests, CreativeWriter workspace, and dashboard files.
- Passed: `git diff --check`
- Passed: `curl -I http://localhost:4747/creativewriter` returned 200 from the running local dev server.
- Passed: unauthenticated API smoke for `GET /api/books/book-1/suggestions` returned 401 `Authentication required.`
- Browser smoke: `npx --yes agent-browser open http://localhost:4747/creativewriter` loaded without a Next.js error overlay, but the automation browser session was signed out and only exposed the public nav/sign-in state.
- Blocked by unrelated existing generated route and route-test typing errors: `npx tsc --noEmit`

## Remaining Risks

- Accepted/applied suggestions do not yet mutate manuscript text.
- Suggestion stale-text conflict handling is not designed yet.
- Cloud Supabase migration execution is not proven by this local slice.
- Live cross-account RLS proof is still required before release claims.
- Typecheck remains blocked by unrelated existing generated route and route-test typing errors outside this slice.

## Next Phase

Proceed to **Phase 5D CreativeWriter Suggestion Review UI** only after deciding whether "applied" should mean a manual status marker or a real paragraph mutation. The safer next step is a review UI that can list, create, withdraw, accept, and reject suggestions without applying text to the manuscript yet.
