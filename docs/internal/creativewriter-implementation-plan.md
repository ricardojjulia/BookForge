# CreativeWriter Implementation Plan

Last updated: 2026-08-03
Factory slices: CreativeWriter Phase 1, Phase 2, Phase 2B, Phase 3, Phase 3R, Phase 4A, Phase 4B, Phase 4C, Phase 4D, Phase 4E, Phase 4F, Phase 4G, Phase 4H, Phase 4F-R, Phase 5A, Phase 5B, Phase 5C, Phase 5D, Phase 5E, Phase 5F, Phase 5G, Phase 5H, Phase 5I, Phase 5J, and Phase 5K

## Factory Scope Lock

Phase 1 is intentionally contract-first.

In scope:

- `.bookforge` package specification.
- Logical package import/export helpers.
- Sync contract schemas.
- Local DB/sync architecture documentation.
- Focused unit tests.
- Factory change log update.

Out of scope:

- Full editor UI.
- Desktop shell.
- Electron/Tauri.
- Supabase migrations.
- Sync API route handlers.
- novelWriter import implementation.
- Zip archive writing.
- Monorepo migration.

## Acceptance Criteria

- `docs/bookforge-package-format.md` exists.
- `docs/creativewriter-sync-architecture.md` exists.
- `docs/creativewriter-implementation-plan.md` exists.
- Package helpers exist under `src/lib/bookforge-package/`.
- Sync schemas exist under `src/lib/creativewriter-sync/`.
- Tests cover package validation, deterministic filenames, export/import, and sync operation validation.
- Verification commands are run and reported.
- Unrelated files are not reverted or modified.

## Decision Log

| Decision | Rationale |
|---|---|
| Build CreativeWriter as a sibling product surface, not a hidden tab. | It needs its own offline writing identity while sharing BookForge contracts. |
| Keep one repo for now. | Shared package/sync/editor logic should mature before any product split. |
| Do not fork novelWriter. | novelWriter is Python/Qt/GPL and would create a separate maintenance burden. |
| Make CreativeWriter BookForge-aware. | Account-linked sync is stronger than one-off import/export. |
| Keep Supabase behind BookForge API. | Desktop/offline clients should not receive direct database authority. |
| Start with package and sync contracts. | UI work without stable data boundaries would create churn. |
| Insert Phase 4A before UI. | Phase 3R found that durable sync state is the release blocker before building user-facing editor sync surfaces. |
| Insert Phase 4B before UI. | A writing UI can create conflicts, so it needs a cloud resolution contract before users depend on it. |

## Risk Register

| Risk | Mitigation |
|---|---|
| Scope creep into a full editor. | Phase 1 excludes UI and desktop shell. |
| Package format becomes too rigid. | Version the manifest and preserve unknown metadata fields later. |
| Direct Supabase coupling leaks into desktop app. | Document and enforce API boundary before implementation. |
| Sync conflicts corrupt author work. | Persist sync events/conflicts and never silently overwrite. |
| novelWriter compatibility becomes a fork. | Treat novelWriter as reference/bridge target only. |

## Phase Roadmap

### Phase 1: Foundation

Status: Implemented 2026-08-02.

- `.bookforge` package spec.
- Package import/export helpers.
- Sync contract types.
- Local DB model documentation.
- Focused tests.

### Phase 2: Cloud Upload/Download

Status: Implemented 2026-08-02 as logical JSON package upload/download.

- Upload `.bookforge` package to BookForge Cloud.
- Parse into Supabase-backed book structure.
- Download cloud book as `.bookforge` package.
- Preserve metadata and versions.

Implemented endpoints:

- `GET /api/books/[bookId]/creativewriter-package`
- `POST /api/creativewriter/packages`

Implemented boundaries:

- Authenticated server-side API only.
- No direct CreativeWriter-to-Supabase access.
- No zip/archive persistence yet.
- Download returns a logical package JSON payload.
- Upload accepts a logical package JSON payload and creates normal BookForge project/book/chapter/scene/paragraph rows.
- Package import metadata is preserved as a `creativewriter_package_import` coherence report.
- Cloud download includes `metadata/sync.json`, `metadata/revisions.json`, and `metadata/book-bible.json` when available.

### Phase 2B: Expanded Import Intake

Status: Implemented 2026-08-02 as best-effort document and writing-app intake.

Implemented endpoint:

- `POST /api/creativewriter/import`

Supported direct inputs:

- `.txt`
- `.md`
- `.markdown`
- `.org`
- `.docx`
- `.pdf`
- `.epub`
- `.kpf`
- `.kcb`
- `.rtf` best effort
- `.bookforge.json`
- Wavemaker-style `.wmProj` JSON

Supported archive/folder-style inputs:

- `.zip`
- Manuskript `.msk` zip-style project files
- bibisco `.bibisco2` zip-style archive when readable text entries are present
- novelWriter-style folders/archives with `.nwd`, Markdown, or text entries
- Markdown-folder exports from Zettlr, Logseq, Obsidian, Joplin, and similar tools

Known limitations:

- Legacy `.doc` requires conversion to `.docx`, `.pdf`, `.txt`, or Markdown before SaaS import.
- Joplin `.jex` tar archives are not parsed yet; export Joplin as Markdown directory for now.
- SQLite-backed proprietary/project databases, including some bibisco and Quoll Writer data stores, need dedicated database adapters or official text exports.
- The importer is intentionally best-effort for third-party archive structures and records warnings instead of pretending full fidelity.

### Phase 3: BookForge-Aware Sync API

Status: Implemented 2026-08-02 as first live sync API surface.

- Authenticated sync endpoints.
- Pull changes.
- Push local queue.
- Sync cursor.
- Conflict records.
- Permission enforcement.
- Version checks.

Implemented endpoints:

- `POST /api/creativewriter/sync/link`
- `POST /api/creativewriter/sync/pull`
- `POST /api/creativewriter/sync/push`

Implemented behavior:

- Pull returns book, chapter, and paragraph changes.
- Push applies supported book/chapter/paragraph updates.
- Push rejects authenticated account mismatches.
- Push detects stale local base versions and returns conflicts.
- Unsupported operations are returned as rejected changes.

Known limitations resolved by Phase 4A:

- Conflict records are persisted in the sync ledger.
- Sync link/project state is persisted.
- Push idempotency keys are checked before cloud writes are reapplied.

Remaining known limitations:

- No create/delete/reorder support yet.
- No local desktop client or offline queue implementation yet.
- Versioning still uses `updated_at` timestamp-derived integer versions for entity snapshots until a monotonic entity-version ledger exists.

### Phase 3R: Factory Hardening Review

Status: Implemented 2026-08-02 as scrutiny and critical hardening gate.

- API contract review.
- Security threat model.
- Data integrity review.
- Failure-mode review.
- Release readiness checklist.
- Council and wildcard review.
- Runtime validation and bounded imports.

### Phase 4A: Durable Sync Ledger

Status: Implemented 2026-08-02 as prerequisite before UI.

- Cloud sync-project ledger.
- Cloud sync-event ledger.
- Persisted applied/conflict/rejected push outcomes.
- Retry-safe idempotency check for push changes.
- RLS policies tied to BookForge book visibility/edit permissions.

Remaining limitations:

- No conflict review UI yet.
- No create/delete/reorder support yet.
- No monotonic per-entity version table yet.

### Phase 4B: Conflict Resolution Contract

Status: Implemented 2026-08-02 as prerequisite before UI.

- Conflict resolution request/response schemas.
- Authenticated `POST /api/creativewriter/sync/resolve-conflict` endpoint.
- Account mismatch rejection.
- `resolved_cloud` support.
- `resolved_local` support from persisted conflict payload.
- `resolved_manual` support with supplied payload.
- Ledger resolution fields for status, payload, note, resolver, and timestamp.

Remaining limitations:

- No conflict review UI yet.
- No create/delete/reorder support yet.
- No monotonic per-entity version table yet.

### Phase 4: CreativeWriter UI

Status: Started 2026-08-02 as Phase 4C internal prototype.

- Chapter tree.
- Markdown manuscript editor.
- Notes/research/bible panels.
- Word counts.
- Status labels.
- Scene/chapter metadata editing.
- Local save queue.
- Sync status UI.

Phase 4C implemented:

- `/creativewriter` internal route.
- Book selector.
- Chapter list.
- Paragraph editor.
- Dirty-state indicator.
- Push/pull controls using CreativeWriter sync APIs.
- Conflict rail and resolution controls.

Phase 4D implemented:

- Repeatable local verification harness.
- Deterministic seeded CreativeWriter manuscript for local Supabase verification.
- Real database proof for pull, push, idempotent replay, conflict creation, conflict resolution, and ledger persistence.
- Authenticated browser proof for the `/creativewriter` route.
- Authenticated browser-context proof for `POST /api/creativewriter/sync/pull` and `POST /api/creativewriter/sync/push`.

Phase 4E implemented:

- Pull merges returned cloud book, chapter, and paragraph changes into client state.
- The active editor updates after pull without requiring a page refresh.
- Pull, chapter switching, and paragraph switching are blocked while a local draft is unsynced.
- Added explicit discard behavior for unsynced local drafts.
- Paragraph selector now supports the full chapter paragraph list through horizontal scrolling.

Phase 4F implemented:

- New conflicts preserve readable cloud payload details when available.
- Conflict rail shows local draft and cloud version sections.
- Manual conflict resolution uses an editable merge textarea.
- `Apply Merge` sends edited merge payloads.
- Conflict actions use clearer labels: `Keep Cloud`, `Use Local`, and `Apply Merge`.

Phase 4G implemented:

- CreativeWriter workspace data now includes normalized support context from existing BookForge tables.
- The right rail now has tabs for Conflicts, Notes, Research, and Bible.
- Notes panel renders author notes and timeline notes.
- Research panel renders reference materials and prompt-inclusion status.
- Bible panel renders book bible summary, characters, locations, themes, and motifs.

Phase 4H implemented:

- Support context has a shared search field across Notes, Research, and Bible.
- Support tab counts reflect the active search result set.
- Authors can pin support-context cards to a per-book pinned section.
- Pins persist in browser local storage keyed by BookForge book id.
- Notes, research, and bible rows render through reusable support cards with source labels.

Phase 4F-R implemented:

- Added a structural conflict design artifact before create/delete/reorder UI work.
- Confirmed current sync behavior rejects structural operations.
- Clarified rejected structural operation messaging.
- Added regression coverage proving create, delete, and reorder are rejected and persisted as ledger rejections.

Phase 4C limitations:

- Not an offline executable.
- No local database or offline queue yet.
- No create/delete/reorder editor actions yet.
- Conflict merge control is prototype-level.

Phase 4D limitations:

- Verification is local Supabase only.
- No cloud Supabase deployment evidence yet.
- No offline executable, local DB, or offline queue yet.
- No create/delete/reorder editor actions yet.

Phase 4E limitations:

- Pull merge only covers supported book/chapter/paragraph update changes.
- No structural conflict model yet.
- No create/delete/reorder editor actions yet.

Phase 4F limitations:

- No word-level diff view yet.
- No structural create/delete/reorder conflict handling yet.
- No batch conflict operations yet.

Phase 4G limitations:

- Notes, research, and bible panels are read-only.
- Non-manuscript support entities do not yet sync through a local offline database.
- Book bible JSON rendering is summarized rather than fully structured.
- Large reference libraries need search, pagination, and pinning.

Phase 4H limitations:

- Pins are local browser preferences, not cloud-synced account state.
- Search runs only over support context already loaded into the workspace.
- Support context remains read-only.
- Conflict payloads are not part of support search.

Phase 4F-R limitations:

- No structural operations are implemented yet.
- No structure-version schema migration exists yet.
- No tombstone strategy is implemented yet.
- No visual order conflict UI exists yet.

### Phase 5: Contributor Workflow

- Assign chapters.
- Comments.
- Suggestions.
- Review states.
- Approvals.
- Cloud sync of contributor status.

Phase 5A implemented contributor comment review triage first because existing `reader_annotations` data and annotation update routes already provide a narrow, authenticated workflow surface. Assignments, suggestions, approvals, and contributor status sync remain future Phase 5 slices.

Phase 5B hardened the comment route and permission contract before adding broader contributor workflow. The route contract now validates payloads, verifies book visibility, validates paragraph targets, and requires comment ownership or book edit permission for resolve, reopen, and delete actions.

Phase 5C implemented contributor suggestions as a dedicated contract instead of overloading reader comments. Suggestions now have their own persistence, lifecycle, permission model, and API routes, while CreativeWriter suggestion UI and manuscript application remain future slices.

Phase 5D implemented the first CreativeWriter suggestion review UI. Users can now create paragraph-scoped suggestions and reviewers can accept, reject, or withdraw proposed suggestions through the Phase 5C API, while accepted suggestions still do not mutate manuscript text.

Phase 5E implemented safe suggestion application. Accepted paragraph-scoped suggestions can now be explicitly applied through an atomic database function that checks edit permission, verifies the paragraph still matches the original text snapshot, mutates paragraph text, and marks the suggestion applied.

Phase 5F implemented stale suggestion recovery. When apply fails because a paragraph changed, CreativeWriter shows original, current, and suggested text, then lets the editor submit explicit merged paragraph text through the atomic apply function.

Phase 5G implemented contributor workflow management inside the Suggestions tab. Suggestion queues now have lifecycle summaries, All/Mine/Reviewed filters, reviewer note entry, and clearer current-user labels.

Phase 5H implemented contributor activity history as a derived CreativeWriter view. The Suggestions tab now shows recent proposal, review, apply, withdraw, and local stale-merge events using existing suggestion lifecycle timestamps, reviewer notes, paragraph targets, and local stale context. No new persistence or API contract was added in this slice.

Phase 5I implemented contributor roster and workload visibility. CreativeWriter now loads existing book collaborators and shows a contributor workload panel derived from reader comments and contributor suggestion lifecycle data. This is a read-only coordination slice; durable assignment rows and contributor status sync remain future work.

Phase 5J restored profile-safe contributor labels after the embedded profile relationship was removed from Phase 5I. CreativeWriter now performs a separate best-effort `profiles` lookup for participant IDs and uses returned display names where RLS permits them, while keeping collaborator loading non-blocking and relationship-free.

Phase 5K implemented the durable contributor assignment contract. Assignments now have a dedicated table, book-scoped RLS policies, authenticated list/create API, workspace loading, profile participant integration, and read-only CreativeWriter visibility. Assignment creation controls and status editing remain future slices.

Phase 5Q made pinned support context device scope explicit. The existing per-book browser storage remains local-only, while the pinned panel now shows visible and accessible language that pins stay on this device and do not sync across devices.

### Phase 6: Offline/Desktop Shell

- Local DB.
- Local package storage.
- Account sign-in.
- Sync queue.
- Optional local AI.

### Phase 7: novelWriter Bridge

- Import novelWriter-style project data.
- Export plain-text structure compatible with offline writing tools.
- Consider a bridge/plugin only after demand.

## Phase 1 Implementation Steps

1. Add package format documentation.
2. Add sync architecture documentation.
3. Add package helper schemas and functions.
4. Add sync contract schemas.
5. Add focused tests.
6. Run targeted tests.
7. Update `docs/SOFTWARE_FACTORY.md` with the slice outcome.

## Phase 2 Implementation Steps

1. Add transfer helpers for cloud package download and upload parsing.
2. Add an authenticated cloud-book download endpoint.
3. Add an authenticated package upload endpoint.
4. Preserve package import evidence as a report.
5. Add service and route tests.
6. Run targeted tests and scoped lint.
7. Update `docs/SOFTWARE_FACTORY.md` with the slice outcome.

## Phase 3R Implementation Steps

1. Add API contract, security, data integrity, failure-mode, release readiness, and council review artifacts.
2. Implement critical import validation hardening.
3. Add missing route coverage for sync link.
4. Run focused CreativeWriter tests and scoped lint.
5. Record remaining release blockers before proceeding.

## Phase 4A Implementation Steps

1. Add Supabase migration for CreativeWriter linked projects and sync events.
2. Protect ledger tables with RLS using BookForge book permission helpers.
3. Upsert linked project state on link/pull and after push.
4. Record applied, rejected, and conflict push outcomes.
5. Check existing idempotency keys before applying cloud writes.
6. Add focused service tests.
7. Update factory documentation and readiness evaluation.

## Phase 4B Implementation Steps

1. Extend sync schemas with conflict resolution request/response contracts.
2. Extend sync ledger fields for resolution state.
3. Add server service for resolving conflicts from the ledger.
4. Add authenticated conflict resolution route.
5. Add service and route tests.
6. Run focused tests and scoped lint.
7. Update factory documentation and readiness evaluation.

## Phase 4C Implementation Steps

1. Add authenticated CreativeWriter prototype route.
2. Add server-side workspace data mapper for books, chapters, paragraphs, and unresolved conflicts.
3. Add client workspace with book/chapter/paragraph navigation.
4. Add paragraph editor, dirty-state indicator, and push action.
5. Add pull action and conflict resolution controls.
6. Add focused component tests.
7. Run tests, scoped lint, typecheck, and browser verification.

## Phase 4D Implementation Steps

1. Add deterministic local verification harness.
2. Seed an isolated CreativeWriter manuscript for the demo author.
3. Verify pull, push, idempotency, conflict creation, manual resolution, and ledger persistence against local Supabase.
4. Verify authenticated `/creativewriter` browser rendering with seeded data.
5. Verify authenticated browser-context sync route calls.
6. Run focused CreativeWriter tests, scoped lint, typecheck, and database checks.
7. Update factory documentation and readiness evaluation.

## Phase 4E Implementation Steps

1. Merge pull response cloud changes into the client workspace state.
2. Refresh the active editor draft from merged paragraph state after pull.
3. Block pull, chapter switching, and paragraph switching while a local draft is unsynced.
4. Add explicit discard behavior for local draft abandonment.
5. Improve paragraph selection ergonomics without adding structural editing.
6. Add focused component tests for pull merge and dirty-navigation blocking.
7. Run focused tests, broader CreativeWriter tests, scoped lint, typecheck, browser verification, and factory documentation updates.

## Phase 4F Implementation Steps

1. Preserve readable cloud payload details in newly-created conflict records.
2. Render local and cloud conflict payloads side by side in the conflict rail.
3. Add editable manual merge text for content conflicts.
4. Send edited merge payloads through the existing conflict resolution endpoint.
5. Improve conflict action labels.
6. Add focused service and component tests for conflict review behavior.
7. Run focused tests, broader CreativeWriter tests, scoped lint, typecheck, browser verification, database verification, and factory documentation updates.

## Phase 4G Implementation Steps

1. Extend the CreativeWriter workspace mapper with normalized support context.
2. Read existing BookForge author notes, reference materials, book bible, characters, locations, themes, motifs, and timeline notes.
3. Replace the conflict-only rail with support tabs while keeping conflicts first.
4. Render read-only Notes, Research, and Bible panels.
5. Seed deterministic local support context for the Phase 4D verification manuscript.
6. Add focused mapper and component tests.
7. Run focused tests, broader CreativeWriter tests, scoped lint, typecheck, browser verification, database verification, and factory documentation updates.

## Phase 4H Implementation Steps

1. Derive reusable support-context entries from the normalized workspace data.
2. Add a shared support-context search field.
3. Filter Notes, Research, and Bible cards by the active search query.
4. Show support tab counts based on filtered results.
5. Add per-book pinned support cards backed by browser local storage.
6. Add focused component tests for search filtering and pin persistence.
7. Run focused tests, broader CreativeWriter tests, scoped lint, typecheck, browser verification, and factory documentation updates.

## Phase 4F-R Implementation Steps

1. Inspect the current sync operation schema and cloud sync rejection behavior.
2. Define structural entity scope for chapters, scenes, and paragraphs.
3. Define create, delete, and reorder payload requirements.
4. Define order, delete-update, create-create, and parent-child conflict semantics.
5. Define versioning and tombstone prerequisites.
6. Add regression coverage for current structural-operation rejection guardrails.
7. Run focused tests, broader CreativeWriter tests, scoped lint, typecheck, and factory documentation updates.

## Phase 4I Implementation Steps

1. Add direct `structure_version` columns to `books` and `chapters`.
2. Add immutable CreativeWriter structural tombstone storage.
3. Protect tombstones with book-scoped RLS policies.
4. Add typed paragraph create, delete, and reorder payload validators.
5. Keep runtime structural operations rejected until conflict semantics are service-tested.
6. Add focused sync contract tests for valid and invalid structural payloads.
7. Run focused tests, scoped lint, migration application, typecheck, and factory documentation updates.

## Phase 5A Implementation Steps

1. Reuse existing `reader_annotations` workspace data as the first contributor workflow surface.
2. Convert the CreativeWriter Comments tab from a passive support list into an Open, All, and Resolved review queue.
3. Add comment-to-paragraph navigation through the existing dirty-draft guard.
4. Resolve and reopen comments through the existing authenticated annotation API.
5. Preserve local support-context pin compatibility for comments.
6. Add focused component coverage for filtering, resolution API payloads, and local state updates.
7. Run focused tests, broader CreativeWriter tests, scoped lint, browser route check, and factory documentation updates.

## Phase 5B Implementation Steps

1. Audit current annotation routes and `reader_annotations` RLS policies.
2. Define comment permissions for book viewers, comment owners, and book editors/admins/owners.
3. Harden annotation list/create routes with explicit book visibility and paragraph scoping checks.
4. Harden annotation update/delete routes with Zod validation and owner-or-editor permission checks.
5. Add a Supabase migration for owner-or-editor annotation update policy.
6. Add focused route tests for auth, invalid payloads, book scoping, paragraph scoping, mutation permissions, and mutation query scoping.
7. Run focused route tests, broader CreativeWriter tests, scoped lint, local migration application, policy proof, typecheck status, and factory documentation updates.

## Phase 5C Implementation Steps

1. Define a dedicated contributor suggestion lifecycle separate from reader comments.
2. Add `creativewriter_contributor_suggestions` persistence with book, chapter, paragraph, proposer, reviewer, status, text evidence, rationale, review note, and lifecycle timestamps.
3. Add RLS policies for book-scoped viewing, viewer proposal creation, proposer withdrawal, and editor/admin/owner review updates.
4. Add authenticated suggestion list and create API routes.
5. Add authenticated suggestion status transition API route.
6. Add focused route coverage for auth, visibility, target scoping, create payloads, proposer withdrawal, editor review, non-editor denial, immutable non-proposed statuses, and mutation query scoping.
7. Run focused tests, scoped lint, local migration application, policy proof, broader CreativeWriter route tests, diff check, typecheck status, and factory documentation updates.

## Phase 5D Implementation Steps

1. Extend the CreativeWriter workspace mapper to load contributor suggestions for the selected book.
2. Add a Suggestions support-rail tab with Proposed, All, and Closed filters.
3. Add a selected-paragraph proposal form with original-text evidence, suggested replacement text, and rationale.
4. Wire create, accept, reject, and withdraw actions to the authenticated Phase 5C suggestion APIs.
5. Preserve the draft-safety guard when navigating from a suggestion to its target paragraph.
6. Add focused mapper and component tests for suggestion loading, creation, review status updates, and non-mutating accepted suggestions.
7. Run focused tests, broader CreativeWriter tests, scoped lint, browser/API smoke, diff check, typecheck status, and factory documentation updates.

## Phase 5E Implementation Steps

1. Add an atomic database function for applying accepted paragraph-scoped suggestions.
2. Require `can_edit_book` inside the apply function.
3. Require the suggestion lifecycle to be `accepted` before apply.
4. Compare the paragraph's current text with the suggestion's original text snapshot before mutation.
5. Update paragraph `current_text`, `accepted_text`, and `updated_at` plus suggestion `applied` lifecycle fields in the same function.
6. Extend the authenticated suggestion status route to call the apply function for `applied` transitions.
7. Add a CreativeWriter Apply button only for accepted suggestions and refresh local paragraph state after success.
8. Add focused route and component tests for apply-before-accept rejection, atomic apply success, stale-text conflict, explicit UI apply, and draft-safety guard.
9. Run focused tests, broader CreativeWriter tests, scoped lint, local migration application, database function proof, browser/API smoke, diff check, typecheck status, and factory documentation updates.

## Phase 5F Implementation Steps

1. Extend stale apply API responses with original, current, and suggested text context.
2. Extend the atomic apply function with explicit manual merged text.
3. Drop the legacy four-argument apply function overload to avoid RPC ambiguity.
4. Store stale suggestion context in CreativeWriter local UI state after a 409 stale apply response.
5. Render a stale suggestion merge panel with original text, current paragraph text, suggested replacement, and manual merge textarea.
6. Send `mergedText` only from the manual merge action and reject blank merged text in the client.
7. Refresh local paragraph and active draft state after successful manual merge apply.
8. Add focused route and component tests for stale context payloads and manual merge apply.
9. Run focused tests, broader CreativeWriter tests, scoped lint, local migration application, function proof, browser/API smoke, diff check, typecheck status, and factory documentation updates.

## Phase 5G Implementation Steps

1. Add suggestion lifecycle summary badges for proposed, accepted, needs merge, applied, rejected, and withdrawn.
2. Add All, Mine, and Reviewed by me filters for the Suggestions review queue.
3. Add reviewer note fields for proposed and accepted suggestions.
4. Send review notes with accept, reject, withdraw, apply, and manual merge apply actions when non-empty.
5. Replace raw current-user IDs with `You` and shorten other contributor IDs in the card surface.
6. Add focused component tests for queue filtering and review note payloads.
7. Run focused tests, broader CreativeWriter tests, scoped lint, route/API smoke, diff check, typecheck status, and factory documentation updates.

## Phase 5H Implementation Steps

1. Derive contributor activity entries from existing suggestion lifecycle fields and local stale suggestion contexts.
2. Show a compact Recent Activity panel in the Suggestions tab with actor, paragraph target, timestamp, status label, and reviewer note/rationale detail.
3. Include local stale apply failures as Needs manual merge events without persisting extra audit rows.
4. Keep the review queue filters independent from the activity history so reviewers can retain situational awareness while filtering cards.
5. Add focused component tests for rendered activity events and stale merge activity.
6. Run focused tests, broader CreativeWriter tests, scoped lint, browser/API smoke, diff check, typecheck status, and factory documentation updates.

## Phase 5I Implementation Steps

1. Extend the CreativeWriter workspace data mapper to load existing `book_collaborators` for the selected book.
2. Add a contributor view contract with user ID, role, nullable display/email labels, and joined timestamp.
3. Derive read-only workload rows from collaborators plus reader comments and contributor suggestions.
4. Show contributor role, open comment count, proposed suggestion count, reviewed suggestion count, applied suggestion count, and latest activity in the Suggestions tab.
5. Include activity-only participants when comments or suggestions reference users not present in the collaborator roster.
6. Add focused mapper and component tests for roster loading and workload rendering.
7. Run focused tests, broader CreativeWriter tests, scoped lint, browser/API smoke, diff check, typecheck status, and factory documentation updates.

## Phase 5J Implementation Steps

1. Keep the `book_collaborators` query free of embedded `profiles(...)` relationships.
2. Collect visible participant IDs from collaborators, reader comments, contributor suggestions, reviewers, and the current account.
3. Perform a separate best-effort `profiles` lookup for `id,display_name`.
4. Ignore profile lookup errors so display labels never block CreativeWriter workspace loading.
5. Add `participantProfiles` to the workspace payload and use it for contributor workload labels.
6. Preserve `You` and shortened contributor ID fallbacks when profile rows are not visible under RLS.
7. Add focused mapper and component tests for profile-safe labels and run the factory verification sweep.

## Phase 5K Implementation Steps

1. Add `creativewriter_contributor_assignments` persistence with book, chapter, paragraph, assignee, assigner, scope, status, title, note, due, and lifecycle timestamps.
2. Add RLS policies for book-scoped viewing, editor creation/management, assignee status updates, and editor deletion.
3. Add authenticated `GET /api/books/[bookId]/assignments` and `POST /api/books/[bookId]/assignments`.
4. Validate create payloads, book edit access, assignee book membership, and optional chapter/paragraph scoping.
5. Load assignments into the CreativeWriter workspace data mapper with missing-table fallback during rollout.
6. Show read-only assignment queue and active assignment counts in the Suggestions tab.
7. Add focused route, mapper, and component tests.
8. Run focused tests, broader CreativeWriter tests, scoped lint, local migration application, route/API smoke, browser smoke, diff check, typecheck status, and factory documentation updates.

## Phase 5L Implementation Steps

1. Add authenticated `PATCH /api/books/[bookId]/assignments/[assignmentId]` for status transitions.
2. Validate status payloads against the durable assignment lifecycle.
3. Require book edit access or direct assignment ownership before updates.
4. Scope assignment lookup and update by both assignment ID and book ID.
5. Maintain `completed_at` consistently when assignments are completed or reopened.
6. Add CreativeWriter assignment action controls for Start, Complete, Reopen, and Cancel.
7. Normalize returned Supabase assignment rows before updating local CreativeWriter state.
8. Add focused route and component tests for permission, status, request payload, and local UI refresh.
9. Run focused tests, broader CreativeWriter tests, scoped lint, route/API smoke, browser smoke, diff check, typecheck status, and factory documentation updates.

## Phase 5Q Implementation Steps

1. Preserve the existing per-book browser `localStorage` pin contract.
2. Show a concise visible device-scope label only when pinned context exists.
3. Add accessible language that pins remain in this browser and do not sync across devices.
4. Give the pinned context section semantic heading structure.
5. Extend the existing support-context pin regression test without adding a cloud persistence contract.
6. Run focused tests, scoped lint, browser proof, diagnostics, diff check, and typecheck evidence.

## Phase 2B Implementation Steps

1. Add CreativeWriter import adapter for direct document files.
2. Add zip/folder best-effort extraction for readable text entries.
3. Add Wavemaker JSON text extraction.
4. Add authenticated import endpoint that converts files to a package and reuses package upload.
5. Document supported formats, fallbacks, and unsupported legacy/proprietary formats.
6. Add focused tests for Markdown, Wavemaker, archive, `.doc` warning, and route behavior.
7. Run targeted tests and scoped lint.

## Phase 3 Implementation Steps

1. Extend sync schemas with push response and cursor helpers.
2. Add cloud sync service for pull snapshots, push application, and conflict detection.
3. Add authenticated link/pull/push routes.
4. Enforce account match on push requests.
5. Add service and route tests.
6. Run targeted tests and scoped lint.
7. Update `docs/SOFTWARE_FACTORY.md` with the slice outcome.

## Approval Gates

| Gate | Required Evidence |
|---|---|
| Scope approval | This plan and the build prompt define the bounded first slice. |
| Architecture approval | Sync architecture keeps Supabase behind BookForge APIs. |
| Data contract approval | Package and sync schemas validate the first contract. |
| Verification approval | Focused tests pass before moving to upload/download work. |
| Upload/download approval | Cloud transfer routes stay authenticated and use normal BookForge rows. |
| Sync API approval | Link/pull/push routes remain authenticated and return explicit conflicts/rejections. |
| Hardening approval | Import boundaries, package validation, and missing route coverage are fixed before wider feature work. |
| Ledger approval | Sync project state and push outcomes persist before CreativeWriter UI work begins. |
| Conflict resolution approval | Conflict resolution is route-addressable and ledger-backed before editor UI work begins. |
| UI prototype approval | The first UI slice exercises writing, sync, and conflict resolution without claiming offline product readiness. |
| Browser/data verification approval | Local Supabase, browser route, authenticated sync routes, and ledger persistence are verified together before broader editor work. |
| Editor ergonomics approval | Pull merge and dirty-draft protections work before expanding editing features. |
| Conflict ergonomics approval | Conflict review exposes both sides and sends explicit edited merge payloads before wider writing surfaces. |
| Structural foundation approval | Structure version columns, tombstone retention, and typed paragraph structural payloads exist before applying structural edits. |
| Contributor suggestion UI approval | Suggestions can be created and reviewed in CreativeWriter without mutating manuscript text before stale-text apply semantics exist. |
| Suggestion apply approval | Accepted paragraph-scoped suggestions apply atomically and fail closed when the paragraph changed after proposal. |
| Stale suggestion merge approval | Stale apply failures expose original/current/suggested text and require explicit manual merged text before mutation. |
| Contributor workflow approval | Suggestion queues expose ownership filters, lifecycle summaries, and reviewer notes without adding new persistence. |
| Contributor activity approval | Suggestion activity is visible from existing lifecycle metadata without adding a new audit-log contract. |
| Contributor workload approval | Existing collaborators and activity-only participants are visible with derived workload counts before adding durable assignments. |
| Profile-safe label approval | Contributor labels use a separate best-effort profile lookup and never depend on embedded relationship availability. |
| Assignment contract approval | Contributor assignments persist behind book-scoped RLS and are visible in CreativeWriter before editing controls ship. |
| Assignment status approval | Contributors can update assignment lifecycle status through authenticated API and CreativeWriter controls before assignment creation UI ships. |
| Pinned context scope approval | Visible and accessible device-only language prevents browser-local pins from implying cross-device sync. |
