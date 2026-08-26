# Build Prompt: BookForge CreativeWriter / BookForge-Aware Offline Client

You are working in `/Users/rjulia/Book Forge`.

Follow `AGENTS.md`: this is a Next.js 16 codebase with breaking changes, so read relevant local Next docs in `node_modules/next/dist/docs/` before changing framework-sensitive code.

## Objective

Design and implement the first engineering slice for **BookForge CreativeWriter**.

CreativeWriter is a distinct BookForge product surface for offline/local book writing. It is inspired by novelWriter's workflow philosophy, but it must be **BookForge-native** and **BookForge-aware**.

Do not fork novelWriter.
Do not port novelWriter code.
Do not introduce Python/Qt into this codebase.

CreativeWriter should eventually function as:

> A local/offline writing desk that can become a native BookForge client when the user signs into a BookForge account.

## Product Split

BookForge should have three compatible product surfaces over time:

| Product | Role |
|---|---|
| **BookForge CreativeWriter** | Offline/local writing, notes, research, book organization, local DB/cache, sync client |
| **BookForge Cloud** | SaaS account, Supabase backend, OpenRouter AI workflows, collaboration, review, export/publishing |
| **BookForge Personal** | Local/private bundle that may include CreativeWriter plus local AI support |

CreativeWriter should be a sibling product surface, not just a hidden tab inside BookForge Cloud.

However, do **not** create a separate repository yet.

Preferred long-term shape:

```text
apps/
  cloud/
  creative-writer/
  personal/

packages/
  manuscript-core/
  bookforge-package/
  creativewriter-core/
  editor-ui/
  sync-protocol/
  storage-adapters/
  ai-workflows/
  ui/
```

If the current repo is not arranged as a monorepo, do not perform a large migration in the first slice. Instead, create the smallest compatible foundation in the existing `src/lib` and `docs` structure with boundaries that can move into packages later.

## Core Product Promise

CreativeWriter is the author's private writing desk.

BookForge Cloud is the managed AI/editorial/publishing layer.

Positioning:

> Write privately in BookForge CreativeWriter. Sign in to BookForge Cloud when you want AI critique, continuity review, collaboration, sync, backup, or publishing prep.

## Important Strategic Decision

CreativeWriter should support two modes.

### 1. Local-Only Mode

The user can work without a BookForge account.

Local-only mode should support:

- Local manuscript editing.
- Local project metadata.
- Notes.
- Research.
- Book bible / story bible.
- Export to `.bookforge` package.
- Later: local AI via LM Studio or similar.

### 2. BookForge-Aware Account Mode

When the user signs into a BookForge account, CreativeWriter becomes a native BookForge client.

Account mode should support:

- Link local project to a BookForge Cloud book.
- Pull cloud book data.
- Work offline using local DB/cache.
- Track local edits.
- Queue changes while offline.
- Sync changes back to BookForge Cloud.
- Pull accepted AI revisions, comments, metadata updates, and version changes.
- Trigger or inspect BookForge Cloud AI jobs later.
- Preserve BookForge's existing revision/versioning rules.

Account mode is the preferred premium workflow.
Upload/download package exchange is the fallback.

## Critical Architecture Rule

CreativeWriter must **not** connect directly to Supabase from the desktop/offline app.

CreativeWriter should talk to authenticated BookForge API endpoints.

Supabase remains behind the BookForge server boundary and continues to enforce server-side source of truth, RLS, storage, auth, jobs, revisions, and metadata.

Preferred flow:

1. User opens CreativeWriter.
2. User signs into BookForge account.
3. CreativeWriter receives a scoped sync token or session.
4. User links or creates a BookForge Cloud book.
5. CreativeWriter pulls:
   - book metadata
   - chapters
   - scenes
   - paragraphs
   - Manuscript Blueprint / book bible
   - continuity metadata
   - timeline metadata
   - character/world/series notes
   - revision/version history
   - accepted AI revisions
   - pending comments/review status
   - contributor assignments if allowed
6. User writes offline.
7. CreativeWriter local DB tracks dirty changes and local versions.
8. On sync, CreativeWriter pushes changes through BookForge Cloud API endpoints.
9. Cloud validates permissions and updates BookForge versioning/metadata.
10. CreativeWriter pulls cloud changes and resolves conflicts.

## Local DB Assumption

Assume CreativeWriter has its own local DB.

That DB is an offline working store/cache, not the global source of truth once a project is linked to BookForge Cloud.

Possible local DB model:

```text
local_project
  id
  bookforge_book_id
  account_id
  sync_cursor
  last_cloud_version
  local_schema_version
  created_at
  updated_at

local_documents
  id
  cloud_chapter_id
  cloud_scene_id
  cloud_paragraph_id
  document_type
  title
  body_markdown
  status
  order_index
  base_version
  local_version
  dirty
  created_at
  updated_at

local_metadata
  id
  project_id
  metadata_type
  payload_json
  base_version
  local_version
  dirty
  updated_at

local_change_queue
  id
  project_id
  entity_type
  entity_id
  operation
  payload_json
  base_version
  local_version
  sync_status
  error_message
  created_at
  synced_at

local_conflicts
  id
  project_id
  entity_type
  entity_id
  local_payload_json
  cloud_payload_json
  base_version
  conflict_type
  resolution_status
  created_at
```

The exact schema can change, but the first slice should document the model clearly.

## Conflict Rules

Do not silently overwrite.

Required sync behavior:

- If only local changed: push local change.
- If only cloud changed: pull cloud change.
- If both local and cloud changed: create a conflict record.
- AI rewrites from cloud should come down as suggestions/revisions unless explicitly accepted.
- Original imported manuscript text remains protected.
- Current/accepted manuscript state must remain distinct from original text and pending suggestions.
- Conflict resolution should be explicit and auditable.

## BookForge Package Format

CreativeWriter needs a durable package format for local-only work, backups, upload/download fallback, and interoperability.

Initial logical shape:

```text
my-book.bookforge/
  bookforge.yml
  manuscript/
    001-opening.md
    002-arrival.md
  notes/
    general.md
  research/
  bible/
    characters.md
    timeline.md
    world.md
  metadata/
    outline.json
    scenes.json
    continuity.json
    revisions.json
    sync.json
  exports/
```

The first implementation may represent this as an in-memory logical package, a folder, or a zip later. The spec should describe the layout and rules clearly.

The package format should support:

- Local-only projects.
- Cloud-linked projects.
- Upload to BookForge Cloud.
- Download from BookForge Cloud.
- Round-trip updates.
- Conflict metadata.
- Version metadata.
- Book bible and continuity metadata.
- Notes/research/bible separation.
- Future novelWriter import/export compatibility.

## novelWriter Relationship

novelWriter is a reference product, not a dependency.

Study the product ideas:

- Local/offline novel project.
- Project tree.
- Manuscript split into smaller documents.
- Notes separate from manuscript.
- Synopsis/comments/status metadata.
- Cross-reference-friendly writing workflow.
- Compile/export concept.
- Author control.

Do not copy GPL code.
Do not port Python/Qt models.
Do not make BookForge depend on novelWriter.

Future compatibility goal:

- Import novelWriter-style project data into BookForge.
- Export BookForge package data into a novelWriter-friendly plain-text structure where practical.
- Possibly build a bridge/plugin later if user demand proves it.

## Required First Engineering Slice

Implement a narrow but real foundation. Do not build the full editor yet.

### 1. Documentation

Create:

```text
docs/bookforge-package-format.md
docs/creativewriter-sync-architecture.md
docs/creativewriter-implementation-plan.md
```

The docs must cover:

- Package structure.
- Manifest schema.
- Metadata schema.
- Local-only vs cloud-linked mode.
- Sync protocol.
- Local DB assumptions.
- Conflict rules.
- Upload/download fallback.
- BookForge Cloud API boundary.
- Why CreativeWriter must not directly connect to Supabase.
- Future novelWriter compatibility.
- Phased implementation plan.

### 2. Package Format Helpers

Add TypeScript helpers under a location such as:

```text
src/lib/bookforge-package/
```

Implement:

- Manifest types.
- Zod validation.
- Package entry types.
- Deterministic chapter filename generation.
- Logical package representation.
- Export helper from BookForge book/chapter/paragraph data to logical package.
- Import parser from logical package to BookForge-friendly chapter records.

Do not write zip/archive support unless it is trivial and already aligned with repo dependencies. A logical package representation is acceptable for the first slice.

### 3. Sync Contract Types

Add TypeScript types under a location such as:

```text
src/lib/creativewriter-sync/
```

Implement types/schemas for:

- Sync cursor.
- Entity version.
- Local change.
- Cloud change.
- Sync pull response.
- Sync push request.
- Conflict record.
- Linked project identity.
- Change operations:
  - create
  - update
  - delete
  - reorder
  - accept_revision
  - reject_revision
  - metadata_update

This can be contract-only in the first slice. Do not build full API endpoints unless the slice remains small.

### 4. Tests

Add focused tests for:

- Manifest validation.
- Invalid manifest rejection.
- Deterministic chapter filename generation.
- Export of two chapters into logical package entries.
- Import of two Markdown chapter entries into BookForge-friendly records.
- Sync conflict detection helper if implemented.
- Change operation schema validation.

Use the repo's test patterns. Prefer focused Vitest tests.

### 5. No Major Product UI Yet

Do not build a full editor UI in this first slice.

Optional if very small:

- A placeholder doc or route can be added later, but the first slice should prioritize the data/package/sync foundation.

## Technical Expectations

Before editing:

- Check `git status --short`.
- Inspect:
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `src/lib/export/`
  - `src/lib/manuscript/`
  - `src/lib/structure/`
  - current Supabase/API patterns if needed
- Read relevant Next.js local docs before framework-sensitive app route changes.

Implementation constraints:

- Keep edits scoped.
- Do not perform monorepo migration.
- Do not add Electron, Tauri, Python, Qt, or novelWriter dependencies.
- Do not add heavy editor dependencies in the first slice.
- Do not alter unrelated files.
- Do not revert user changes.
- Keep package/sync logic independent enough to move into future packages.
- Use ASCII unless the existing file style requires otherwise.
- Add concise comments only where useful.

## Future Phases

Document these phases.

### Phase 1: Foundation

- `.bookforge` package spec.
- Package import/export helpers.
- Sync contract types.
- Local DB model documentation.

### Phase 2: Cloud Upload/Download

- Upload `.bookforge` package to BookForge Cloud.
- Parse into Supabase-backed book structure.
- Download cloud book as `.bookforge` package.
- Preserve metadata and versions.

### Phase 3: BookForge-Aware Sync API

- Authenticated sync endpoints.
- Pull changes.
- Push local queue.
- Sync cursor.
- Conflict records.
- Permission enforcement.
- Version checks.

### Phase 4: CreativeWriter UI

- Chapter tree.
- Markdown manuscript editor.
- Notes/research/bible panels.
- Word counts.
- Status labels.
- Scene/chapter metadata editing.
- Local save queue.
- Sync status UI.

### Phase 5: Contributor Workflow

- Assign chapters.
- Comments.
- Suggestions.
- Review states.
- Approvals.
- Cloud sync of contributor status.

### Phase 6: Offline/Desktop Shell

- Local DB.
- Local package storage.
- Account sign-in.
- Sync queue.
- Optional local AI.

### Phase 7: novelWriter Bridge

- Import novelWriter-style project data.
- Export plain-text structure compatible with offline writing tools.
- Consider plugin only after demand.

## Acceptance Criteria

The first slice is complete when:

- `docs/bookforge-package-format.md` exists.
- `docs/creativewriter-sync-architecture.md` exists.
- `docs/creativewriter-implementation-plan.md` exists.
- TypeScript helpers exist for package manifest/types/import/export.
- TypeScript sync contract types/schemas exist.
- Tests cover the core package and sync helpers.
- No unrelated worktree changes are reverted.
- Relevant tests are run and reported.

## Final Response Required

Summarize:

- Files changed.
- What the slice enables.
- Tests run.
- Known limitations.
- Recommended next step.
