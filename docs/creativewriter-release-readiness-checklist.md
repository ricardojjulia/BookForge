# CreativeWriter Release Readiness Checklist

Date: 2026-08-02
Phase: 5A Contributor Comment Review Triage
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
- [ ] Desktop executable exists.
- [ ] Local CreativeWriter database exists.
- [ ] Contributor assignments, suggestions, approvals, and contributor status sync are implemented.
- [ ] Notes/research/bible edits sync through a designed non-manuscript contract.
- [ ] Pinned context syncs across devices or has explicit local-only product language.
- [ ] Visual order conflict review exists.
- [ ] Import jobs run outside request/response lifecycle.
- [ ] Full cloud browser/API/data verification exists.
- [ ] Cloud Supabase deployment evidence exists.
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
