# Software Factory Execution Log

Last updated: 2026-08-02
Owner: Engineering
Branch: feat/v0.3.0-next

## Mission

Execute the v0.3.0 software-factory cycle with traceable phases, explicit acceptance criteria, and fresh documentation.

## World Bible Factory Slice — AI Discovery

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

In scope:

- A **Discover with AI** action in the World Bible.
- Reuse of the durable Manuscript Blueprint extraction job.
- Normalized persistence for characters, locations, themes, motifs, and timeline notes.
- Per-book processed status, completion timestamp, and manuscript source hash.
- AI provenance and deterministic discovery keys on normalized entities.
- Manual-entry preservation and promotion of edited AI rows to manual ownership.
- Focused service and component tests plus local migration proof.

Out of scope:

- Semantic entity merging or an author-facing conflict resolver.
- Automatic stale-state calculation after manuscript edits.
- A separate discovery job/event table.
- Cloud Supabase migration deployment.

### Approval Gates

- Architecture approval: discovery is an explicit mode of the existing durable Blueprint analyzer, not a second extraction pipeline.
- Data approval: AI inserts only missing entities; manual rows are never overwritten.
- Ownership approval: editing an AI-discovered entity clears its discovery provenance and makes it manual.
- Reliability approval: queue-first handoff, job heartbeats, cancellation, and Jobs History remain the source of truth.
- Verification approval: focused tests, scoped lint, local migration application, and schema dump proof pass before closeout.

### Decisions

- Store detailed Blueprint metadata in `book_bibles.content` and normalized editable entities in their existing tables.
- Add `world_bible_processed`, `world_bible_status`, `world_bible_processed_at`, and `world_bible_source_hash` to `books`.
- Use partial unique indexes for AI discovery keys while allowing intentional duplicate manual entries.
- Recover from a partial entity-batch failure through idempotent rerun rather than adding a new transaction RPC in this slice.

### Verification Evidence

- Passed: `npx vitest run src/lib/world/discovery.test.ts src/lib/world/discovery-server.test.ts src/components/books/world/world-bible-editor.test.tsx`
- Result: 3 test files passed, 7 tests passed.
- Passed: scoped ESLint and editor diagnostics for discovery services, analyzer, World Bible routes/page/component, prompt builder, and tests.
- Passed: local migration `202608020003_world_bible_discovery.sql` applied with `supabase migration up --local`.
- Passed: local schema dump confirmed book status fields, entity provenance checks, and five partial unique discovery-key indexes.
- Runtime proof: the existing dev server returned HTTP 200 for BookForge and HTTP 200 with the expected `Book not found` state for a placeholder World Bible route, confirming the modified page compiled and executed.
- Browser screenshot proof was unavailable because the workspace Playwright Chromium binary is not installed.
- Blocked by 11 unrelated existing test typing errors in six files: `npx tsc --noEmit`.

### Deliverables

- `supabase/migrations/202608020003_world_bible_discovery.sql`
- `src/lib/world/discovery.ts`
- `src/lib/world/discovery-server.ts`
- `src/lib/world/discovery.test.ts`
- `src/lib/world/discovery-server.test.ts`
- `src/components/books/world/world-bible-editor.tsx`
- `src/components/books/world/world-bible-editor.test.tsx`
- `src/app/api/books/[bookId]/analyze/route.ts`
- `src/app/api/books/[bookId]/world/[entityType]/[entityId]/route.ts`
- `src/app/books/[bookId]/world/page.tsx`

## CreativeWriter Factory Slice — Phase 1 Foundation

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice establishes the contract foundation for BookForge CreativeWriter, a BookForge-aware offline writing client.

In scope:

- `.bookforge` package format documentation.
- CreativeWriter sync architecture documentation.
- CreativeWriter phased implementation plan.
- Logical package manifest/import/export helpers.
- Sync contract schemas for linked projects, changes, pull/push payloads, and conflicts.
- Focused Vitest coverage.

Out of scope:

- Desktop executable.
- Editor UI.
- Sync API route handlers.
- Supabase migrations.
- Zip/archive persistence.
- novelWriter code import or fork.
- Monorepo restructuring.

### Approval Gates

- Scope approval: Phase 1 remains documentation plus isolated contract/helper modules only.
- Architecture approval: CreativeWriter does not connect directly to Supabase; it syncs through future BookForge API endpoints.
- Data contract approval: `.bookforge` package manifests and sync operations validate through Zod schemas.
- Product approval: novelWriter remains a reference and compatibility target, not a dependency.
- Verification approval: focused tests and scoped lint were run before closing the slice.

### Decisions

- Build CreativeWriter as a sibling product surface while keeping the current repo structure.
- Use `.bookforge` as the local/cloud interchange package contract.
- Treat local CreativeWriter storage as an offline working cache once linked to BookForge Cloud.
- Make conflict records explicit and auditable; never silently overwrite local or cloud author work.
- Keep upload/download as fallback while account-linked sync remains the preferred premium workflow.

### Verification Evidence

- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts`
- Passed: `npx eslint src/lib/bookforge-package/index.ts src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/index.ts src/lib/creativewriter-sync/sync.test.ts`
- Blocked by unrelated existing test typing errors: `npx tsc --noEmit`

### Phase 1 Deliverables

- `docs/bookforge-package-format.md`
- `docs/creativewriter-sync-architecture.md`
- `docs/creativewriter-implementation-plan.md`
- `src/lib/bookforge-package/index.ts`
- `src/lib/bookforge-package/package.test.ts`
- `src/lib/creativewriter-sync/index.ts`
- `src/lib/creativewriter-sync/sync.test.ts`

## CreativeWriter Factory Slice — Phase 2 Cloud Upload/Download

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice implements logical `.bookforge` package upload/download through authenticated BookForge API endpoints.

In scope:

- Cloud-book package download endpoint.
- Logical package upload endpoint.
- Transfer helper that maps BookForge rows to a package.
- Transfer helper that maps a package into normal BookForge rows.
- Service-level and route-level tests.
- Documentation updates for Phase 2.

Out of scope:

- Zip/archive file persistence.
- Desktop executable.
- Full sync protocol routes.
- Conflict resolution UI.
- Supabase migrations.
- novelWriter bridge.

### Approval Gates

- Scope approval: Phase 2 remains upload/download fallback only, not live sync.
- Architecture approval: routes use BookForge API auth and server Supabase client; CreativeWriter still does not connect directly to Supabase.
- Data approval: package upload creates normal `projects`, `books`, `chapters`, `scenes`, and `paragraphs` rows.
- Metadata approval: package import evidence is stored as a `creativewriter_package_import` report; cloud download includes sync/revision metadata entries.
- Verification approval: focused service and route tests plus scoped lint passed.

### Verification Evidence

- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts`
- Passed: `npx eslint src/lib/bookforge-package/index.ts src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/index.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-cloud/package-transfer.ts src/lib/creativewriter-cloud/package-transfer.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.ts' 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.ts src/app/api/creativewriter/packages/route.test.ts`
- Blocked by unrelated existing test typing errors: `npx tsc --noEmit`

### Phase 2 Deliverables

- `src/lib/creativewriter-cloud/package-transfer.ts`
- `src/lib/creativewriter-cloud/package-transfer.test.ts`
- `src/app/api/books/[bookId]/creativewriter-package/route.ts`
- `src/app/api/books/[bookId]/creativewriter-package/route.test.ts`
- `src/app/api/creativewriter/packages/route.ts`
- `src/app/api/creativewriter/packages/route.test.ts`

## CreativeWriter Factory Slice — Phase 2B Expanded Import Intake

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice expands CreativeWriter cloud import beyond logical package JSON to common manuscript files and best-effort exports from evaluated writing tools.

In scope:

- Direct import of TXT, Markdown, Org text, DOCX, PDF, EPUB, KPF/KCB, RTF best effort, `.bookforge.json`, and Wavemaker `.wmProj`.
- Zip/folder extraction of readable text, Markdown, Org, HTML/XML, DOCX, Wavemaker JSON, and novelWriter `.nwd` entries.
- Best-effort intake for novelWriter, Manuskript, Zettlr, Logseq, Obsidian, Joplin Markdown export, Wavemaker, bibisco zip-style archives, and similar tools.
- Authenticated `/api/creativewriter/import` route that converts uploaded files to a package and imports through the existing package-transfer path.
- Focused import adapter and route tests.

Out of scope:

- Legacy `.doc` binary conversion.
- Joplin `.jex` tar parsing.
- SQLite/database-native adapters for proprietary project stores.
- Guaranteed full-fidelity third-party project reconstruction.
- UI upload controls.

### Approval Gates

- Scope approval: imports remain best-effort intake, not full app-specific migrations.
- Architecture approval: route uses BookForge API auth and reuses the package-transfer service.
- Data approval: imported content still lands as normal BookForge rows through package import.
- Risk approval: unsupported/proprietary formats produce warnings or explicit conversion guidance.
- Verification approval: focused import tests and scoped lint passed.

### Verification Evidence

- Passed: `npx vitest run src/lib/creativewriter-import/import.test.ts src/app/api/creativewriter/import/route.test.ts`
- Included in focused CreativeWriter verification bundle before closeout.

### Phase 2B Deliverables

- `src/lib/creativewriter-import/index.ts`
- `src/lib/creativewriter-import/import.test.ts`
- `src/app/api/creativewriter/import/route.ts`
- `src/app/api/creativewriter/import/route.test.ts`

## CreativeWriter Factory Slice — Phase 3 BookForge-Aware Sync API

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice implements the first authenticated live sync API surface for BookForge-aware CreativeWriter clients.

In scope:

- Link endpoint for initial account/book binding.
- Pull endpoint for cloud book/chapter/paragraph snapshots.
- Push endpoint for queued local changes.
- Timestamp-derived sync cursors and cloud versions.
- Conflict detection for stale local base versions.
- Explicit rejected-change responses for unsupported operations.
- Service and route tests.

Out of scope:

- Durable conflict table.
- Conflict resolution route/UI.
- Desktop client local queue.
- Create/delete/reorder operations.
- Revision accept/reject sync actions.
- Dedicated sync ledger migration.

### Approval Gates

- Scope approval: Phase 3 is live sync API surface only, not the desktop client.
- Architecture approval: all sync traffic goes through authenticated BookForge API routes.
- Auth approval: push rejects account mismatches between linked project and authenticated user.
- Conflict approval: stale local writes return explicit conflict records and do not apply.
- Verification approval: focused sync service and route tests plus scoped lint passed.

### Verification Evidence

- Passed: `npx vitest run src/lib/creativewriter-sync/cloud-sync.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts`
- Passed: `npx eslint src/lib/creativewriter-sync/index.ts src/lib/creativewriter-sync/cloud-sync.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/app/api/creativewriter/sync/link/route.ts src/app/api/creativewriter/sync/pull/route.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.ts src/app/api/creativewriter/sync/push/route.test.ts`

### Phase 3 Deliverables

- `src/lib/creativewriter-sync/cloud-sync.ts`
- `src/lib/creativewriter-sync/cloud-sync.test.ts`
- `src/app/api/creativewriter/sync/link/route.ts`
- `src/app/api/creativewriter/sync/pull/route.ts`
- `src/app/api/creativewriter/sync/pull/route.test.ts`
- `src/app/api/creativewriter/sync/push/route.ts`
- `src/app/api/creativewriter/sync/push/route.test.ts`

## CreativeWriter Factory Slice — Phase 3R Hardening Review

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice uplevels the CreativeWriter software-factory process by adding explicit review gates and implementing the critical hardening findings that surfaced from those gates.

In scope:

- API contract review.
- Security threat model.
- Data integrity review.
- Failure-mode review.
- Release readiness checklist.
- Council and wildcard review.
- Runtime validation for CreativeWriter import sources.
- Import request limits for file count, file size, archive entries, extracted entry text, and total extracted text.
- Schema validation for uploaded `.bookforge.json` packages.
- Sync link route tests.
- Import authentication and validation tests.

Out of scope:

- Durable sync ledger.
- Durable conflict table.
- Device registration or signed link tokens.
- Background import jobs.
- Desktop executable.
- Conflict resolution UI.
- Production subscription entitlement enforcement.

### Approval Gates

- API approval: all current CreativeWriter API routes are named and have expected auth/data invariants documented.
- Security approval: untrusted imports are bounded before deeper processing.
- Package approval: uploaded `.bookforge.json` packages validate through the logical package schema.
- Sync approval: link, pull, and push routes have direct route-level coverage.
- Release approval: broad release is explicitly blocked until ledger, conflict persistence, executable, cloud evidence, and entitlement enforcement exist.
- Wildcard approval: import fidelity and conflict visibility are identified as user-trust risks before beta.

### Decisions

- Treat Phase 3R as a hardening and scrutiny phase, not a feature-expansion phase.
- Keep CreativeWriter in controlled build-out status, not beta or GA.
- Add bounded import controls now, even before background import jobs exist.
- Keep best-effort third-party imports honest through warnings and release documentation.
- Require a durable sync ledger before expanding beyond update operations.

### Verification Evidence

- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts src/lib/creativewriter-import/import.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts src/app/api/creativewriter/import/route.test.ts src/app/api/creativewriter/sync/link/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts`
- Result: 11 test files passed, 32 tests passed.
- Passed: scoped ESLint across all CreativeWriter package, import, cloud transfer, and sync route files.
- Blocked by unrelated existing route-test typing errors: `npx tsc --noEmit`

### Phase 3R Deliverables

- `docs/creativewriter-api-contract-review.md`
- `docs/creativewriter-security-threat-model.md`
- `docs/creativewriter-data-integrity-review.md`
- `docs/creativewriter-failure-modes.md`
- `docs/creativewriter-release-readiness-checklist.md`
- `docs/creativewriter-council-review.md`
- `src/lib/creativewriter-import/index.ts`
- `src/lib/creativewriter-import/import.test.ts`
- `src/app/api/creativewriter/import/route.ts`
- `src/app/api/creativewriter/import/route.test.ts`
- `src/app/api/creativewriter/sync/link/route.test.ts`

## CreativeWriter Factory Slice — Phase 4A Durable Sync Ledger

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice inserts a prerequisite before CreativeWriter UI work: cloud-side sync durability.

In scope:

- Supabase migration for CreativeWriter linked-project state.
- Supabase migration for durable sync events.
- RLS policies for sync ledger tables.
- Link/pull upsert of cloud sync project state.
- Push idempotency lookup before applying changes.
- Push recording for applied, conflict, and rejected outcomes.
- Focused tests for ledger write and idempotency behavior.
- Phase 4A evaluation before proceeding.

Out of scope:

- Conflict resolution endpoint.
- Conflict review UI.
- Create/delete/reorder sync operations.
- Monotonic per-entity version ledger.
- Desktop executable.
- Entitlement enforcement.
- Background import jobs.

### Approval Gates

- Scope approval: this phase is durability-only, not editor UI.
- Database approval: ledger tables use BookForge book-scoped RLS helpers.
- Idempotency approval: duplicate push idempotency keys do not reapply cloud writes.
- Conflict approval: stale local changes persist conflict payloads.
- Release approval: UI may proceed only as internal prototype until conflict resolution and version guarantees are added.

### Decisions

- Insert Phase 4A before the planned UI phase.
- Store linked CreativeWriter project state in `creativewriter_sync_projects`.
- Store push outcomes in `creativewriter_sync_events`.
- Use the existing BookForge API boundary; CreativeWriter still does not connect directly to Supabase.
- Recommend Phase 4B conflict resolution contract before broad UI expansion.

### Verification Evidence

- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts src/lib/creativewriter-import/import.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts src/app/api/creativewriter/import/route.test.ts src/app/api/creativewriter/sync/link/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts`
- Result: 11 test files passed, 33 tests passed.
- Passed: scoped ESLint across CreativeWriter sync service and sync route files.
- Blocked by unrelated existing route-test typing errors: `npx tsc --noEmit`

### Phase 4A Deliverables

- `supabase/migrations/202608020002_creativewriter_sync_ledger.sql`
- `src/lib/creativewriter-sync/cloud-sync.ts`
- `src/lib/creativewriter-sync/cloud-sync.test.ts`
- `docs/creativewriter-phase-4a-evaluation.md`
- `docs/creativewriter-implementation-plan.md`
- `docs/creativewriter-sync-architecture.md`

## CreativeWriter Factory Slice — Phase 4B Conflict Resolution Contract

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice adds the cloud conflict-resolution contract required before CreativeWriter editor UI work.

In scope:

- Conflict resolution request and response schemas.
- Ledger fields for conflict resolution state.
- Server-side conflict resolution service.
- Authenticated conflict resolution API route.
- Account mismatch rejection.
- `resolved_cloud`, `resolved_local`, and `resolved_manual` handling.
- Service and route tests.
- Phase 4B evaluation before proceeding.

Out of scope:

- Conflict review UI.
- Desktop/local database.
- Create/delete/reorder sync operations.
- Monotonic per-entity version ledger.
- Subscription entitlement enforcement.

### Approval Gates

- Scope approval: this phase is a cloud contract only, not editor UI.
- Auth approval: route requires authentication and rejects linked account mismatch.
- Ledger approval: resolution state is persisted on the durable conflict event.
- Data approval: local/manual resolutions use the existing supported update handlers.
- Release approval: next UI phase remains internal prototype until versioning, entitlement, and migration evidence are complete.

### Decisions

- Resolve conflicts by `book_id`, `account_id`, and `conflict_id`.
- Keep `status = conflict` as the event outcome and track resolution separately with `resolution_status`.
- `resolved_cloud` marks the conflict resolved without mutating manuscript rows.
- `resolved_local` applies the persisted local conflict payload.
- `resolved_manual` requires an explicit resolved payload.
- Recommend Phase 4C minimal UI prototype next, with conflict list/resolution included.

### Verification Evidence

- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts src/lib/creativewriter-import/import.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts src/app/api/creativewriter/import/route.test.ts src/app/api/creativewriter/sync/link/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts`
- Result: 12 test files passed, 38 tests passed.
- Passed: scoped ESLint across CreativeWriter sync service and sync route files.
- Blocked by unrelated existing route-test typing errors: `npx tsc --noEmit`

### Phase 4B Deliverables

- `src/lib/creativewriter-sync/index.ts`
- `src/lib/creativewriter-sync/cloud-sync.ts`
- `src/lib/creativewriter-sync/cloud-sync.test.ts`
- `src/app/api/creativewriter/sync/resolve-conflict/route.ts`
- `src/app/api/creativewriter/sync/resolve-conflict/route.test.ts`
- `supabase/migrations/202608020002_creativewriter_sync_ledger.sql`
- `docs/creativewriter-phase-4b-evaluation.md`
- `docs/creativewriter-implementation-plan.md`
- `docs/creativewriter-sync-architecture.md`

## CreativeWriter Factory Slice — Phase 4C Minimal UI Prototype

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice adds an internal BookForge Cloud UI prototype for CreativeWriter without claiming offline desktop readiness.

In scope:

- Authenticated `/creativewriter` route.
- Server-side workspace data mapper for existing books, chapters, paragraphs, and unresolved conflicts.
- Book selector.
- Chapter list.
- Paragraph editor.
- Dirty-state indicator.
- Push action through the CreativeWriter sync API.
- Pull action through the CreativeWriter sync API.
- Conflict rail from durable ledger events.
- Conflict resolution controls through the CreativeWriter resolve-conflict API.
- Component tests for push and conflict resolution behavior.
- Phase 4C readiness evaluation.

Out of scope:

- Desktop executable.
- Local database.
- Offline change queue.
- Create/delete/reorder editor actions.
- Notes/research/bible editing panels.
- Entitlement enforcement.
- Full snapshot merge on pull.

### Approval Gates

- Scope approval: this is an internal prototype, not a marketable CreativeWriter release.
- Architecture approval: UI uses BookForge API routes for sync writes and conflict resolution.
- Data approval: server page reads authenticated BookForge data and unresolved ledger conflicts.
- UX approval: first screen is the usable writing desk, not a marketing page.
- Verification approval: focused component tests, CreativeWriter bundle, scoped lint, and browser verification must run before closeout.

### Decisions

- Use `/creativewriter` as the internal prototype route.
- Keep the first editor at paragraph granularity to avoid introducing create/delete/reorder risk.
- Include conflict visibility and resolution controls in the first UI slice.
- Keep the next factory phase focused on browser/API/data verification before broadening editor features.

### Verification Evidence

- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts src/lib/creativewriter-import/import.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts src/app/api/creativewriter/import/route.test.ts src/app/api/creativewriter/sync/link/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 13 test files passed, 40 tests passed.
- Passed: scoped ESLint across CreativeWriter UI, sync, route, and app-shell files.
- Blocked by unrelated existing route-test typing errors: `npx tsc --noEmit`
- Browser verification: `http://localhost:4747/creativewriter` loaded without a Next.js error overlay; current browser session was signed out and correctly rendered the login-required state plus the new CreativeWriter navigation link.

### Defect Closeout

- Runtime report: Next.js dev overlay surfaced `Failed to execute 'measure' on 'Performance': 'CreativeWriterPage' cannot have a negative time stamp`.
- Root cause: server render failed while querying `creativewriter_sync_events`; the active Supabase schema returned `PGRST205` because the Phase 4A ledger migration was not present in the schema cache.
- Fix: workspace loading now treats a missing CreativeWriter ledger table as an empty conflict queue, and the page has a controlled fallback alert for unexpected workspace-load failures.
- Regression coverage: `src/lib/creativewriter-ui/dashboard.test.ts` verifies the missing-ledger fallback and helper classification.
- Updated verification: 14 CreativeWriter-focused test files passed with 42 tests; scoped ESLint passed; browser verification confirmed `/creativewriter` renders without a Next.js error overlay.
- Remaining operational note: apply `supabase/migrations/202608020002_creativewriter_sync_ledger.sql` in any active database before testing conflict visibility or sync-ledger behavior.

### Migration Application Evidence

- Applied locally: `psql 'postgresql://postgres:postgres@127.0.0.1:58322/postgres' -v ON_ERROR_STOP=1 -f supabase/migrations/202608020002_creativewriter_sync_ledger.sql`.
- Recorded migration history: inserted `202608020002` / `creativewriter_sync_ledger` into `supabase_migrations.schema_migrations`.
- Reloaded PostgREST schema cache: `notify pgrst, 'reload schema'`.
- Verified tables: `creativewriter_sync_projects` and `creativewriter_sync_events` exist in `public`.
- Verified policies: six RLS policies exist across sync projects and sync events.
- Verified route: `/creativewriter` returns HTTP 200 and browser overlay check returns `OK`.

### Phase 4C Deliverables

- `src/app/creativewriter/page.tsx`
- `src/components/creativewriter/creativewriter-workspace.tsx`
- `src/components/creativewriter/creativewriter-workspace.test.tsx`
- `src/lib/creativewriter-ui/dashboard.ts`
- `docs/creativewriter-phase-4c-evaluation.md`
- `docs/creativewriter-implementation-plan.md`
- `docs/SOFTWARE_FACTORY.md`

## CreativeWriter Factory Slice — Phase 4D Browser And Data Verification

Date: 2026-08-02
Status: Implemented, local verification passed
Owner: Product + Engineering

### Scope Lock

This slice verifies the CreativeWriter Cloud prototype against real local data before expanding editor behavior.

In scope:

- Deterministic local Supabase verification harness.
- Seeded demo-author manuscript fixture.
- Pull verification against real database rows.
- Push verification against real database rows.
- Sync ledger persistence verification.
- Idempotency replay verification.
- Durable conflict creation verification.
- Manual conflict resolution verification.
- Authenticated browser route verification.
- Authenticated browser-context sync route verification.
- Phase 4D readiness evaluation.

Out of scope:

- Cloud Supabase migration execution.
- Desktop executable.
- Local CreativeWriter database.
- Offline queue.
- Create/delete/reorder editor operations.
- Subscription entitlement enforcement.
- Background import jobs.

### Approval Gates

- Scope approval: this is verification and hardening, not feature expansion.
- Data approval: local Supabase contains the Phase 4A ledger tables and stores sync project/event outcomes.
- API approval: browser-authenticated pull and push routes return `200` and persist expected data.
- UI approval: authenticated `/creativewriter` renders seeded manuscript data without a Next.js overlay.
- Release approval: product remains internal-only until cloud evidence, entitlement checks, local storage, and executable proof exist.

### Decisions

- Add a repeatable `npx tsx scripts/creativewriter-phase-4d-verify.ts` harness instead of relying on manual checks.
- Leave the deterministic Phase 4D manuscript in local Supabase after verification so the browser route has real data to inspect.
- Keep browser route verification authenticated through the local demo author.
- Continue blocking broader release claims despite local verification passing.

### Verification Evidence

- Passed: `npx tsx scripts/creativewriter-phase-4d-verify.ts`
- Harness result: verified pull, applied push, idempotent replay, stale conflict creation, manual resolution, and ledger persistence.
- Passed: authenticated browser render for `http://localhost:4747/creativewriter?bookId=4d000000-0000-4000-8000-000000000002`.
- Browser result: rendered `demo@bookforge.local`, `Phase 4D Verification Manuscript`, and `Verification Chapter` with no Next.js error overlay.
- Passed: browser-authenticated `POST /api/creativewriter/sync/pull` returned `200`.
- Passed: browser-authenticated `POST /api/creativewriter/sync/push` returned `200` with applied change `phase-4d-browser-route-change`.
- Passed: database verification showed final paragraph text `Phase 4D browser-authenticated route update.`.
- Passed: database verification showed applied, resolved conflict, and browser-route applied sync events.
- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts src/lib/creativewriter-import/import.test.ts src/lib/creativewriter-ui/dashboard.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts src/app/api/creativewriter/import/route.test.ts src/app/api/creativewriter/sync/link/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 14 test files passed, 42 tests passed.
- Passed: scoped ESLint across the Phase 4D harness, CreativeWriter UI, dashboard mapper, and sync routes.
- Blocked by unrelated existing route-test typing errors: `npx tsc --noEmit`

### Phase 4D Deliverables

- `scripts/creativewriter-phase-4d-verify.ts`
- `docs/creativewriter-phase-4d-evaluation.md`
- `docs/creativewriter-implementation-plan.md`
- `docs/creativewriter-release-readiness-checklist.md`
- `docs/SOFTWARE_FACTORY.md`

## CreativeWriter Factory Slice — Phase 4E Editor Ergonomics And Snapshot Merge

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice improves the existing CreativeWriter editor loop without adding structural manuscript operations.

In scope:

- Pull response merge into client workspace state.
- Active paragraph editor refresh after pull.
- Dirty-draft guard before pull.
- Dirty-draft guard before chapter switching.
- Dirty-draft guard before paragraph switching.
- Explicit draft discard action.
- Full paragraph selector visibility through horizontal scrolling.
- Focused component regression tests.
- Browser verification against local Supabase.

Out of scope:

- Create/delete/reorder editor actions.
- Structural conflict handling.
- Offline desktop executable.
- Local CreativeWriter database.
- Subscription entitlement enforcement.
- Cloud Supabase deployment verification.

### Approval Gates

- Scope approval: ergonomics only, no structural editing.
- Data approval: pull merges supported cloud update changes without a page refresh.
- Draft-safety approval: unsynced local text cannot be lost by pull or navigation without explicit discard.
- UX approval: paragraph selection is no longer capped at the first eight paragraphs.
- Verification approval: component tests, CreativeWriter bundle, scoped lint, and browser proof pass before closeout.

### Decisions

- Keep pull merge limited to book, chapter, and paragraph update changes.
- Block pull when a local draft is dirty instead of attempting automatic three-way merge in the UI.
- Block paragraph/chapter navigation while dirty and provide a visible `Discard` action.
- Keep create/delete/reorder blocked until structural conflict semantics exist.

### Verification Evidence

- Passed: `npx vitest run src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 1 test file passed, 4 tests passed.
- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts src/lib/creativewriter-import/import.test.ts src/lib/creativewriter-ui/dashboard.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts src/app/api/creativewriter/import/route.test.ts src/app/api/creativewriter/sync/link/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 14 test files passed, 44 tests passed.
- Passed: scoped ESLint for `src/components/creativewriter/creativewriter-workspace.tsx` and `src/components/creativewriter/creativewriter-workspace.test.tsx`.
- Browser proof: authenticated as `demo@bookforge.local`, opened the seeded CreativeWriter manuscript, updated the active paragraph directly in local Supabase, clicked Pull, and verified the textarea updated to `Phase 4E second pull merge proof.` without a Next.js overlay.
- Blocked by unrelated existing route-test typing errors: `npx tsc --noEmit`

### Phase 4E Deliverables

- `src/components/creativewriter/creativewriter-workspace.tsx`
- `src/components/creativewriter/creativewriter-workspace.test.tsx`
- `docs/creativewriter-phase-4e-evaluation.md`
- `docs/creativewriter-implementation-plan.md`
- `docs/creativewriter-release-readiness-checklist.md`
- `docs/SOFTWARE_FACTORY.md`

## CreativeWriter Factory Slice — Phase 4F Conflict Review Ergonomics

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice improves content-conflict review clarity without changing the sync contract or exposing structural editing.

In scope:

- Preserve readable cloud payload details for newly-created conflicts.
- Show Local draft and Cloud version sections in the conflict rail.
- Add editable manual merge text.
- Send edited manual merge payloads through the existing resolve-conflict route.
- Rename conflict actions for intent clarity.
- Clear local merge draft state after resolution.
- Focused service and component regression tests.
- Browser and database verification against local Supabase.

Out of scope:

- Word-level diff rendering.
- Structural create/delete/reorder conflicts.
- Batch conflict resolution.
- New sync endpoint contracts.
- Offline desktop conflict queue.
- Subscription entitlement enforcement.

### Approval Gates

- Scope approval: conflict ergonomics only, no structural editing.
- Data approval: newly-created conflicts include cloud payload details when available.
- UX approval: authors can see local text, cloud text, and edit a manual merge value before resolving.
- API approval: manual merge uses the existing authenticated conflict resolution route.
- Verification approval: tests, lint, browser proof, and database proof pass before closeout.

### Decisions

- Keep the existing `resolved_manual` contract and improve the payload supplied by the UI.
- Use readable payload fields in priority order: `currentText`, `title`, `summary`, then `status`.
- Keep conflict review in the rail for this phase rather than creating a full compare workspace.
- Continue blocking create/delete/reorder until structural conflict semantics exist.

### Verification Evidence

- Passed: `npx vitest run src/lib/creativewriter-sync/cloud-sync.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 2 test files passed, 11 tests passed.
- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts src/lib/creativewriter-import/import.test.ts src/lib/creativewriter-ui/dashboard.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts src/app/api/creativewriter/import/route.test.ts src/app/api/creativewriter/sync/link/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 14 test files passed, 45 tests passed.
- Passed: scoped ESLint for CreativeWriter sync service and workspace files.
- Browser proof: authenticated as `demo@bookforge.local`, opened the seeded CreativeWriter manuscript, verified Local draft and Cloud version sections, edited the manual merge textarea, clicked `Apply Merge`, and saw `Conflict resolved in the cloud ledger.` without a Next.js overlay.
- Database proof: `creativewriter_sync_events.resolution_status` became `resolved_manual` for `conflict-phase-4f-visible`, `resolved_payload` stored `Phase 4F browser-applied manual merge.`, and the paragraph text was updated to that value.
- Defect proof: clicking from the Phase 4D verification book to `Phase Switch Verification Manuscript` now changes URL, chapter heading, and textarea content without a manual browser refresh.
- Blocked by unrelated existing route-test typing errors: `npx tsc --noEmit`

### Phase 4F Deliverables

- `src/lib/creativewriter-sync/cloud-sync.ts`
- `src/lib/creativewriter-sync/cloud-sync.test.ts`
- `src/components/creativewriter/creativewriter-workspace.tsx`
- `src/components/creativewriter/creativewriter-workspace.test.tsx`
- `docs/creativewriter-phase-4f-evaluation.md`
- `docs/creativewriter-implementation-plan.md`
- `docs/creativewriter-release-readiness-checklist.md`
- `docs/SOFTWARE_FACTORY.md`

## CreativeWriter Factory Slice — Phase 4G Notes, Research, And Bible Panels

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice makes CreativeWriter more BookForge-aware by rendering existing support context without adding non-manuscript edit or sync semantics.

In scope:

- Read existing BookForge author notes, reference materials, book bible, characters, locations, themes, motifs, and timeline notes.
- Normalize support data in the CreativeWriter workspace mapper.
- Add right-rail tabs for Conflicts, Notes, Research, and Bible.
- Keep conflicts as the first tab.
- Add focused mapper and component regression tests.
- Browser and database verification against local Supabase.

Out of scope:

- Editing notes, research, or bible records from CreativeWriter.
- Offline local database support for non-manuscript entities.
- Structural manuscript create/delete/reorder operations.
- Search, pinning, pagination, or full JSON bible rendering.
- Subscription entitlement enforcement.
- Cloud Supabase deployment proof.

### Approval Gates

- Scope approval: support panels are read-only and do not change the sync contract.
- Data approval: server-side workspace mapper reads existing BookForge tables behind the authenticated page boundary.
- UX approval: authors can access notes, research, and bible context without leaving the manuscript desk.
- Verification approval: focused tests, CreativeWriter bundle, scoped lint, browser proof, and database proof pass before closeout.

### Decisions

- Keep BookForge as the source of truth for support context in this phase.
- Normalize support rows in `src/lib/creativewriter-ui/dashboard.ts`; do not pass raw Supabase table shapes to the client component.
- Keep the existing conflict workflow in the same rail and make support context discoverable through tabs.
- Defer editable notes/research/bible until non-manuscript sync and conflict behavior are explicitly designed.

### Verification Evidence

- Passed: `npx vitest run src/lib/creativewriter-ui/dashboard.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 2 test files passed, 9 tests passed.
- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts src/lib/creativewriter-import/import.test.ts src/lib/creativewriter-ui/dashboard.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts src/app/api/creativewriter/import/route.test.ts src/app/api/creativewriter/sync/link/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 14 test files passed, 47 tests passed.
- Passed: scoped ESLint for CreativeWriter dashboard and workspace files.
- Browser proof: authenticated as `demo@bookforge.local`, opened the seeded CreativeWriter manuscript, verified Notes, Research, and Bible tabs rendered seeded support context, and confirmed no Next.js error overlay.
- Database proof: seeded support rows were present for `author_notes`, `reference_materials`, and `characters` for the Phase 4D verification manuscript.
- Blocked by unrelated existing route-test typing errors: `npx tsc --noEmit`

### Phase 4G Deliverables

- `src/lib/creativewriter-ui/dashboard.ts`
- `src/lib/creativewriter-ui/dashboard.test.ts`
- `src/components/creativewriter/creativewriter-workspace.tsx`
- `src/components/creativewriter/creativewriter-workspace.test.tsx`
- `docs/creativewriter-phase-4g-evaluation.md`
- `docs/creativewriter-implementation-plan.md`
- `docs/creativewriter-release-readiness-checklist.md`
- `docs/SOFTWARE_FACTORY.md`

## CreativeWriter Factory Slice — Phase 4H Support Context Ergonomics

Date: 2026-08-02
Status: Implemented, focused verification passed
Owner: Product + Engineering

### Scope Lock

This slice improves usability of the read-only support context without introducing support-record writes or new sync contracts.

In scope:

- Shared search across Notes, Research, and Bible support context.
- Search-aware tab result counts.
- Per-book pinned support cards.
- Browser localStorage persistence for pinned support cards.
- Reusable support card rendering with source labels.
- Focused component regression tests.
- Authenticated browser verification against local Supabase.

Out of scope:

- Cloud-synced pins.
- Editing notes, research, or bible records.
- Offline local database support for non-manuscript entities.
- Structural manuscript create/delete/reorder operations.
- Full-text server search or pagination.
- Subscription entitlement enforcement.
- Cloud Supabase deployment proof.

### Approval Gates

- Scope approval: ergonomics only, no support-context mutation.
- Data approval: pins are local browser preferences keyed by selected BookForge book id.
- UX approval: authors can search and pin support context while staying in the manuscript workspace.
- Verification approval: focused tests, CreativeWriter bundle, scoped lint, and browser proof pass before closeout.

### Decisions

- Use browser localStorage for pins in this phase because pins are workspace affordances, not BookForge source data.
- Keep a single support search field above the right-rail tabs.
- Keep conflict search out of this slice; conflicts remain a separate review workflow.
- Recommend structural conflict design before any manuscript create/delete/reorder UI.

### Verification Evidence

- Passed: `npx vitest run src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 1 test file passed, 8 tests passed.
- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts src/lib/creativewriter-import/import.test.ts src/lib/creativewriter-ui/dashboard.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts src/app/api/creativewriter/import/route.test.ts src/app/api/creativewriter/sync/link/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 14 test files passed, 48 tests passed.
- Passed: scoped ESLint for CreativeWriter dashboard and workspace files.
- Browser proof: authenticated as `demo@bookforge.local`, opened the seeded CreativeWriter manuscript, searched `Mara`, verified the Bible tab filtered to the matching character and excluded the location, pinned the character, verified the per-book localStorage key, cleared search, and confirmed pinned context plus broader bible context remained visible without a Next.js error overlay.
- Blocked by unrelated existing route-test typing errors: `npx tsc --noEmit`

### Phase 4H Deliverables

- `src/components/creativewriter/creativewriter-workspace.tsx`
- `src/components/creativewriter/creativewriter-workspace.test.tsx`
- `docs/creativewriter-phase-4h-evaluation.md`
- `docs/creativewriter-implementation-plan.md`
- `docs/creativewriter-release-readiness-checklist.md`
- `docs/SOFTWARE_FACTORY.md`

## CreativeWriter Factory Slice — Phase 4F-R Structural Conflict Design

Date: 2026-08-02
Status: Design gate implemented, structural operations still blocked
Owner: Product + Engineering

### Scope Lock

This slice defines the structural conflict model required before CreativeWriter exposes manuscript create, delete, or reorder controls.

In scope:

- Inspect current schema and sync-service behavior for structural operations.
- Document create, delete, and reorder payload contracts.
- Document order, delete-update, create-create, and parent-child conflict semantics.
- Define structure-version and tombstone prerequisites.
- Keep structural operations rejected in the current sync service.
- Add regression coverage proving structural operations are rejected and ledgered.

Out of scope:

- Implementing structural create/delete/reorder.
- Adding database migrations for structure versions or tombstones.
- Adding structural editor UI controls.
- Adding visual order conflict UI.
- Syncing notes/research/bible edits.
- Subscription entitlement enforcement.

### Approval Gates

- Scope approval: design and guardrails only; no structural mutation behavior.
- Data approval: current create/delete/reorder pushes remain rejected and do not mutate manuscript rows.
- Contract approval: structural payload and conflict semantics are documented before implementation.
- Verification approval: focused sync test, CreativeWriter bundle, scoped lint, and typecheck status are recorded.

### Decisions

- Do not expose manuscript create/delete/reorder controls yet.
- Prefer direct `structure_version` columns on books and chapters for the first structural implementation.
- Prefer soft deletes/tombstones before any hard delete behavior is exposed.
- Start future implementation with paragraph-only create/reorder/delete behind internal controls.
- Require visual order conflict review before broader structural editing.

### Verification Evidence

- Passed: `npx vitest run src/lib/creativewriter-sync/cloud-sync.test.ts`
- Result: 1 test file passed, 7 tests passed.
- Passed: `npx vitest run src/lib/bookforge-package/package.test.ts src/lib/creativewriter-sync/sync.test.ts src/lib/creativewriter-sync/cloud-sync.test.ts src/lib/creativewriter-cloud/package-transfer.test.ts src/lib/creativewriter-import/import.test.ts src/lib/creativewriter-ui/dashboard.test.ts 'src/app/api/books/[bookId]/creativewriter-package/route.test.ts' src/app/api/creativewriter/packages/route.test.ts src/app/api/creativewriter/import/route.test.ts src/app/api/creativewriter/sync/link/route.test.ts src/app/api/creativewriter/sync/pull/route.test.ts src/app/api/creativewriter/sync/push/route.test.ts src/app/api/creativewriter/sync/resolve-conflict/route.test.ts src/components/creativewriter/creativewriter-workspace.test.tsx`
- Result: 14 test files passed, 49 tests passed.
- Passed: scoped ESLint for CreativeWriter sync service, sync tests, dashboard, and workspace files.
- Blocked by unrelated existing route-test typing errors: `npx tsc --noEmit`

### Phase 4F-R Deliverables

- `docs/creativewriter-structural-conflict-design.md`
- `src/lib/creativewriter-sync/cloud-sync.ts`
- `src/lib/creativewriter-sync/cloud-sync.test.ts`
- `docs/creativewriter-implementation-plan.md`
- `docs/creativewriter-release-readiness-checklist.md`
- `docs/SOFTWARE_FACTORY.md`

## Scope

- Lock the v0.3.0 release slice.
- Design durable background processing and job-history visibility.
- Improve collaborator and export workflows.
- Keep status, TODO, and factory documentation in sync with delivery.

## v0.3.0 Workstreams

1. Release scope and milestones

- Status: In progress
- Owner: Product + Engineering
- Deliverable: Release goals, non-goals, and exit criteria for v0.3.0.

1. Operational maturity

- Status: In progress
- Owner: App Platform
- Deliverable: Durable jobs, job-history UX, retry/cancel/visibility policy.

1. Product quality

- Status: Planned
- Owner: App UI + Platform
- Deliverable: Export metadata controls, collaborator workflow refinements, and test expansion.

## Execution Phases

### Phase A — Scope Lock (Blocker)

- [ ] Confirm v0.3.0 scope and non-goals.
- [ ] Define release checkpoints and owner map.
- [ ] Freeze the first implementation slice.

Acceptance:

- Scope is small enough to ship incrementally.
- Every slice has an owner and acceptance criteria.

### Phase B — Operational Maturity

- [ ] Design durable background processing for long-running AI workflows.
- [ ] Add a job-history screen for queued/running/completed work.
- [ ] Define retry/cancel/visibility behavior.

Acceptance:

- Long-running work can be observed and managed.
- Job state is visible without relying on request-bound completion.

### Phase C — Product Quality

- [ ] Refine export styling and metadata controls.
- [ ] Improve collaborator workflows where coordination is still manual.
- [ ] Expand tests around parsing, rewrite planning math, and export assembly.

Acceptance:

- The highest-friction author workflows are easier to complete.
- Test coverage increases in the riskier core paths.

## Risk Register

- Risk: Scope creep can turn v0.3.0 into an unfocused release.
- Mitigation: Freeze the first slice and require explicit acceptance criteria.

- Risk: Long-running jobs can still be request-bound.
- Mitigation: Favor a dedicated job-history contract and later durable worker integration.

## Change Log (Factory)

- 2026-08-02: Completed CreativeWriter Phase 1 foundation with `.bookforge` package documentation, BookForge-aware sync architecture, phased implementation plan, package import/export helpers, sync contract schemas, focused Vitest coverage, and scoped ESLint verification.
- 2026-08-02: Completed CreativeWriter Phase 2 cloud upload/download fallback with authenticated logical-package download and upload routes, package transfer helpers, service/route tests, and scoped ESLint verification.
- 2026-08-02: Completed CreativeWriter Phase 2B expanded import intake for common manuscript files and best-effort writing-app exports, including direct import route, adapter tests, route tests, documentation, and scoped verification.
- 2026-08-02: Completed CreativeWriter Phase 3 BookForge-aware sync API with authenticated link/pull/push routes, timestamp cursor/version contract, stale-write conflict detection, rejected-change reporting, tests, and scoped lint verification.
- 2026-08-02: Completed CreativeWriter Phase 3R hardening review with API/security/data/failure/release/council artifacts, import validation limits, package upload validation, sync link route coverage, focused Vitest coverage, and scoped ESLint verification.
- 2026-08-02: Inserted CreativeWriter Phase 4A durable sync ledger before UI work, adding linked-project and sync-event tables, RLS policies, ledger writes, push idempotency checks, and phase evaluation documentation.
- 2026-08-02: Completed CreativeWriter Phase 4B conflict resolution contract with typed request/response schemas, authenticated resolve route, ledger resolution fields, local/cloud/manual resolution handling, focused tests, and readiness evaluation.
- 2026-08-02: Added CreativeWriter Phase 4C internal UI prototype with authenticated route, workspace data mapper, paragraph editor, sync controls, conflict rail, resolution actions, component tests, and readiness evaluation.
- 2026-08-02: Closed CreativeWriter runtime defect where a missing `creativewriter_sync_events` table caused a server render failure and Next.js Performance overlay; added a missing-ledger fallback, page-level load fallback, regression coverage, and browser verification.
- 2026-08-02: Applied CreativeWriter sync ledger migration to the local BookForge Supabase database, recorded migration version `202608020002`, reloaded PostgREST schema cache, and verified route/browser health.
- 2026-08-02: Completed CreativeWriter Phase 4D browser and data verification with a deterministic local Supabase harness, authenticated browser route proof, browser-authenticated sync route calls, ledger persistence checks, focused tests, and scoped lint.
- 2026-08-02: Completed CreativeWriter Phase 4E editor ergonomics and snapshot merge with in-place pull merging, dirty-draft navigation guards, explicit discard, full paragraph selector visibility, focused tests, scoped lint, and authenticated browser proof.
- 2026-08-02: Completed CreativeWriter Phase 4F conflict review ergonomics with cloud payload preservation, local/cloud compare sections, editable manual merge payloads, clearer resolution actions, focused tests, scoped lint, browser proof, database proof, and stale book-switch context fix.
- 2026-08-02: Completed CreativeWriter Phase 4G notes/research/bible panels with normalized support context, read-only right-rail tabs, local Supabase seed proof, focused tests, scoped lint, authenticated browser proof, and database proof.
- 2026-08-02: Completed CreativeWriter Phase 4H support context ergonomics with shared search, search-aware tab counts, per-book local pins, reusable support cards, focused tests, scoped lint, and authenticated browser proof.
- 2026-08-02: Completed CreativeWriter Phase 4F-R structural conflict design with create/delete/reorder payload semantics, order/delete-update/create-create/parent-child conflict rules, versioning/tombstone prerequisites, explicit structural rejection wording, focused guardrail tests, and factory documentation.
- 2026-06-02: Added auto-review wizard resume success-path regression coverage to verify launch-token reuse and consistent job-id propagation across handshake and worker-launch calls.
- 2026-06-02: Added auto-review wizard success-path regression coverage that verifies launch-token reuse between `launchOnly` handshake and worker-launch calls, and stabilized wizard tests by mocking the runner dependency.
- 2026-06-02: Added auto-review wizard regression coverage for resume-path launch-handshake failure, verifying inline error surfacing and single process-launch attempt semantics.
- 2026-06-02: Added a second auto-review wizard regression test that validates launch-handshake failure messaging and verifies no duplicate worker-launch call is attempted after failed acknowledgement.
- 2026-06-02: Replaced auto-review wizard launch/start `alert` failures with inline error state and delayed runner activation until launch handshake succeeds, with a regression test for queued-start failure messaging.
- 2026-06-02: Added an idempotent auto-review process launch handshake (`launchToken` + `launchOnly`) so retries can receive fast worker-launch acknowledgements without duplicate launches, plus process-route test coverage.
- 2026-06-02: Converted auto-review start to queue-first handoff (`serverManaged`) with true resume-by-job-id behavior in the wizard, and added API test coverage for queued start responses.
- 2026-06-02: Converted auto-revision execution to queue-first handoff (`serverManaged` + `jobId`), updated auto-review callers to use queue→worker stage calls, and added persistent job resume support for `auto_revision`.
- 2026-06-02: Converted voice-capture execution to queue-first handoff (`serverManaged` + `jobId`), updated Voice Capture panel calls, and added persistent job resume support for `voice_capture`.
- 2026-06-02: Converted rewrite drift-check execution to queue-first handoff (`serverManaged` + `jobId`), updated quality-gate/execution-panel callers, and added persistent job resume support for `rewrite_drift_check`.
- 2026-06-02: Converted Rewrite Architect planning to queue-first handoff (`serverManaged` + `jobId`) and updated planning UI/persistent job resume wiring for `rewrite_plan` runs.
- 2026-06-02: Converted single-lens BookForge Critic runs to queue-first handoff (`serverManaged` + `jobId`) and updated critic recheck UI + persistent jobs retries to use durable worker resume.
- 2026-06-02: Converted Publishing Lab execution to queue-first handoff (`serverManaged` + `jobId`) and wired persistent jobs resume support for `publishing_lab` runs.
- 2026-06-02: Expanded deterministic test coverage for parsing/defaulting and rewrite planning math (`plan-defaults`, `call-planner`).
- 2026-06-02: Added actionable workflow notifications (mark one/mark all read) and rewrite approval route tests for permission and assignment transitions.
- 2026-06-02: Added collaborator workflow ownership for revision review and rewrite approval (reviewer assignment + status transitions) with in-app notifications and optional email hooks.
- 2026-06-02: Completed export-controls refinement with explicit "Use last export settings" / "Reset to recommended defaults" actions and EPUB/PDF guardrail validation, plus export route/component tests.
- 2026-06-02: Added export-control persistence so final manuscript metadata/style settings are saved on export rows and used to prefill the next export run.
- 2026-06-02: Moved remaining rewrite-related UI callers (guidance rewrite modal, revision review rewrite-again action, and persistent jobs retry/replacement for queue-capable routes) to queue-first handoff.
- 2026-06-02: Split rewrite execution (main panel flow) into a queue-first job creation step plus a worker resume call so long rewrite batches no longer block the initiating request.
- 2026-06-02: Split Critic batch generation into a queue-first job creation step plus a worker resume call so Book Actions can launch all-lens evaluation without blocking the full batch run.
- 2026-06-02: Split Manuscript Blueprint generation into a queue-first job creation step plus a worker resume call so the dashboard can launch analysis without waiting on the full chunk loop.
- 2026-06-02: Split chapter summary generation into a queue-first job creation step plus a worker resume call so the UI no longer blocks on the whole summarization batch.
- 2026-06-02: Split planned draft generation into a queue-first job creation step plus a worker handoff so the request handler no longer has to do the whole batch inline.
- 2026-06-02: Added a server worker route for auto-review so the wizard can enqueue work and monitor progress instead of orchestrating the stages itself.
- 2026-06-02: Extended the heartbeat pattern to the full-book rewrite executor so paragraph-level rewrite jobs stay visible during long model calls.
- 2026-06-02: Added persistent heartbeats for long-running analysis, summary, critic, and draft-generation routes so in-flight jobs stay visible during blocking model calls.
- 2026-06-02: Completed the Phase 1 job-history visibility slice with summary cards and stale-running prioritization.
- 2026-06-02: Reframed the factory log for the v0.3.0 cycle and updated branch context.
- 2026-06-01: Created software-factory execution log and phased plan.
- 2026-06-01: Completed High-finding architecture doc fix and rolled freshness UX to dashboard/book/rewrite/final/analytics routes.
- 2026-06-01: Implemented freshness telemetry sink (`/api/telemetry/freshness`) and added Vitest coverage for freshness policy and banner lifecycle behavior.
- 2026-06-01: Added durable `freshness_events` storage + analytics page 24h reliability section (event counts, route success rates, latest failures).
- 2026-06-01: Added filterable freshness telemetry panel with 24h/7d window controls, route filter, and mini trend bars.
- 2026-06-01: Added dedicated paginated freshness reliability endpoint (`GET /api/analytics/freshness`) and switched telemetry panel to API-backed drilldown pagination.
- 2026-06-01: Upgraded freshness endpoint to cursor pagination + drilldown filters (`window`, `routeKey`, `eventName`, `status`) with event row table in UI.
- 2026-06-01: Added lightweight reliability SLO cards (success/failure/forced rates) with threshold health badges.
- 2026-06-01: Added retention cleanup function (`cleanup_freshness_events`) and freshness alert table for operational signals.
- 2026-06-01: Added critical failure observability hooks in telemetry ingest (repeated failures and forced-refresh loops) with alert surfacing in analytics panel.
