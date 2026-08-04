# CreativeWriter Phase 5N Evaluation

Date: 2026-08-04
Phase: Contributor Assignment Notifications
Status: Implemented, focused verification passed with unrelated typecheck blockers

## Scope

Phase 5N notifies contributors when assignments are created, reassigned, changed, cancelled, or newly due soon. It reuses BookForge collaboration notifications and optional email delivery, and surfaces the existing notification panel inside CreativeWriter.

This phase does not add scheduled reminder jobs, delivery retries, notification preferences, assignment deletion notifications, or assigner progress notifications.

## Implementation

- Added centralized assignment notification event selection and metadata.
- Notified new assignees when assignments are created or reassigned.
- Notified previous assignees when reassignment removes their responsibility.
- Notified current assignees when assignment details change or assignments are cancelled.
- Emitted a due-soon event when a created or changed due date falls within 72 hours.
- Included assignment, chapter, paragraph, and due-date metadata in every event.
- Kept notification delivery after successful assignment persistence.
- Attempted all events independently and contained delivery failures so committed mutations still return success.
- Made optional workflow email failures non-fatal while preserving in-app notification writes.
- Loaded each user's book-scoped workflow notifications into CreativeWriter with existing mark-read controls.
- Expanded the pre-update assignment snapshot to include all fields required for accurate event comparisons.

## Council Decisions

| Decision | Rationale |
|---|---|
| Reuse `collaboration_notifications` and optional Resend email. | Preserves the existing workflow channel and RLS contract. |
| Derive recipients only from persisted assignment rows. | Prevents request payloads from selecting arbitrary recipients. |
| Notify both previous and new assignees on reassignment. | Makes responsibility transfer explicit to both people. |
| Keep ordinary start/complete/reopen progress silent. | Avoids notifying contributors about their own routine lifecycle actions. |
| Treat notification delivery as best-effort after mutation. | A delivery outage must not return a false failure after assignment persistence commits. |
| Emit due-soon only when setting a date inside 72 hours. | Provides immediate urgency without introducing a scheduler in this bounded phase. |
| Reuse the existing notification panel in CreativeWriter. | Contributors should see assignment events where they manage assignments. |

## Verification

- `npx vitest run src/lib/collaboration/workflow.test.ts src/lib/creativewriter/assignment-notifications.test.ts 'src/app/api/books/[bookId]/assignments/route.test.ts' 'src/app/api/books/[bookId]/assignments/[assignmentId]/route.test.ts' src/lib/creativewriter-ui/dashboard.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
  - Result: Passed, 6 test files, 49 tests.
- Scoped ESLint across Phase 5M/5N routes, helpers, page, mapper, workspace, and tests.
  - Result: Passed.
- `npx tsc --noEmit`
  - Result: Phase 5N files have no diagnostics. The project check remains blocked by 12 unrelated generated route and route-test errors in `.next/types/validator.ts`, auto-review, chat, export, rewrite-workflow, and revisions review-workflow tests.
- Authenticated browser smoke at `http://localhost:4747/creativewriter`.
  - Result: Passed. CreativeWriter rendered `Workflow notifications`; no runtime, build, or application error text appeared. Only existing asset preload warnings were logged.
- Full Software Council review.
  - Result: Authorization and recipient derivation passed. Council findings for incomplete previous snapshots, post-commit failure semantics, multi-event delivery, and missing CreativeWriter visibility were repaired before final verification.

## Remaining Risks

- Due-soon reminders are event-driven when due dates are set or changed; no scheduled scan emits reminders as time advances.
- Failed in-app or email delivery is logged but not queued for retry.
- Assignment deletion remains silent; editors should cancel assignments first when assignee communication is required.
- Assigners are not notified about routine assignee progress changes.
- Cross-account cloud Supabase RLS proof remains required before beta.
