# CreativeWriter Release Readiness Checklist

Date: 2026-08-04
Phase: 5Q Pinned Context Device-Scope Clarity
Status: Not ready for broad release

## Current Readiness

- [x] Package contract exists.
- [x] Package parser/builder has focused tests.
- [x] Cloud package upload/download routes exist.
- [x] Expanded import route exists.
- [x] Live sync link/pull/push routes exist.
- [x] Critical import validation hardening is in place.
- [x] Sync link/pull/push route tests exist.
- [x] Durable sync ledger exists.
- [x] Durable conflict persistence exists.
- [x] Local browser/API/data verification exists.
- [x] Pull merges cloud snapshots into the internal editor without a page refresh.
- [x] Unsynced paragraph drafts are protected from accidental navigation loss.
- [x] Conflict review shows local and cloud payloads for content conflicts.
- [x] Manual conflict merge sends edited merge text.
- [x] Read-only CreativeWriter notes/research/bible panels render existing BookForge support context.
- [x] Support context can be searched and pinned locally per book.
- [x] Structural create/delete/reorder operations remain rejected until conflict semantics exist.
- [x] Structural conflict design exists before structural UI exposure.
- [x] Structure versioning and tombstone strategy are implemented.
- [x] Contributor comments can be triaged in CreativeWriter with Open, All, and Resolved review filters.
- [x] Reader comments can be marked resolved or reopened from CreativeWriter through the existing authenticated annotation API.
- [x] Reader comment routes validate payloads, book visibility, paragraph scoping, and owner-or-editor mutation permissions.
- [x] Reader annotation update RLS allows comment owners or book editors/admins/owners to resolve or reopen comments.
- [x] Contributor suggestions have a dedicated persistence contract, lifecycle, RLS policy set, and API route surface.
- [x] Contributor suggestion UI is implemented in CreativeWriter for create, accept, reject, and withdraw review flows.
- [x] Accepting a suggestion remains non-mutating; applying an accepted suggestion is the explicit manuscript mutation step.
- [x] Accepted paragraph-scoped suggestions can be explicitly applied through an atomic database function.
- [x] Suggestion apply fails closed when the paragraph has changed after proposal.
- [x] Stale suggestion apply shows original, current, and suggested text in CreativeWriter.
- [x] Stale suggestion apply can be recovered with explicit manual merged text.
- [x] Contributor suggestion queues show lifecycle summary counts.
- [x] Contributor suggestion queues support All, Mine, and Reviewed by me filters.
- [x] Reviewer notes can be submitted with suggestion review and apply actions.
- [x] Contributor suggestion activity history is visible in CreativeWriter from existing lifecycle metadata.
- [x] Local stale suggestion apply failures are surfaced as Needs manual merge activity events.
- [x] Existing book collaborators load into CreativeWriter as contributor roster context.
- [x] Contributor workload counts are derived from reader comments and suggestion lifecycle data.
- [x] Contributor display labels use a separate best-effort profile lookup instead of embedded Supabase relationships.
- [x] Durable contributor assignment persistence and book-scoped RLS policies exist.
- [x] Contributor assignments can be listed and created through authenticated BookForge APIs.
- [x] CreativeWriter shows read-only assignment queue and active assignment counts.
- [x] Contributor assignment status can be updated through an authenticated BookForge API.
- [x] CreativeWriter assignment controls can start, complete, reopen, and cancel assignments.
- [ ] Desktop executable exists.
- [ ] Local CreativeWriter database exists.
- [x] Accepted/applied suggestions can safely mutate manuscript text with stale-text conflict handling.
- [ ] Contributor assignment creation, reassignment, edit, and delete controls are implemented.
- [ ] Notes/research/bible edits sync through a designed non-manuscript contract.
- [x] Pinned context syncs across devices or has explicit local-only product language.
- [ ] Visual order conflict review exists.
- [ ] Import jobs run outside request/response lifecycle.
- [ ] Full cloud browser/API/data verification exists.
- [ ] Cloud Supabase deployment evidence exists.
- [ ] Live cross-account RLS proof exists for reader comments in cloud Supabase.
- [ ] Live cross-account RLS proof exists for contributor suggestions in cloud Supabase.
- [ ] Subscription entitlements are enforced against CreativeWriter capabilities.

## Controlled Pilot Gate

CreativeWriter can proceed toward a richer internal prototype after local browser/API/data verification. It should not be offered as a production subscription benefit until cloud Supabase evidence, entitlement checks, import job isolation, local storage, and offline executable proof are complete.

## Required Evidence Before Beta

- Focused unit and route tests pass.
- Typecheck failures are either fixed or explicitly unrelated with file-level evidence.
- Local app can create, edit, save, close, reopen, export, link, pull, and push a book.
- A stale offline edit produces a visible conflict.
- A `.bookforge` package can round trip cloud to local to cloud without losing chapters.
- Large import attempts are bounded and observable.
- Authenticated user A cannot access user B content through any CreativeWriter route.
- Structural create/delete/reorder edits have conflict semantics before they are exposed.
