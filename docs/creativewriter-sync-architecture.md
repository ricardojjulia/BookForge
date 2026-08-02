# CreativeWriter Sync Architecture

Last updated: 2026-08-02
Factory slices: CreativeWriter Phase 1, Phase 2, Phase 2B, Phase 3, Phase 3R, Phase 4A, and Phase 4B

## Purpose

CreativeWriter is a local/offline writing desk that can become a BookForge-aware client when the user signs into BookForge Cloud.

This document defines the sync boundary, local database assumptions, conflict model, and first contract decisions.

## Architecture Summary

```text
CreativeWriter local app
  local DB/cache
  local .bookforge package
  offline change queue
          |
          | authenticated BookForge API
          v
BookForge Cloud
  route handlers
  permission checks
  validation
  sync/version API
  durable sync ledger
          |
          v
Supabase
  Auth
  Postgres/RLS
  Storage
  revision_jobs/revision_versions
```

## Critical Boundary

CreativeWriter must not connect directly to Supabase.

Reasons:

- Supabase schema is an internal server-side persistence model.
- BookForge Cloud must enforce permission and subscription policy.
- Sync requires version checks and conflict handling beyond raw table writes.
- Desktop/local clients should receive scoped API tokens, not database credentials.
- Future API changes should not require local DB clients to understand every Supabase table.

## Product Modes

### Local-Only Mode

The user can write without an account.

Local-only mode supports:

- local manuscript documents,
- notes/research/bible entries,
- package export/import,
- local version tracking,
- future local AI integration.

There is no cloud source of truth.

### Account-Linked Mode

The user signs into BookForge Cloud and links a local project to a cloud book.

Account-linked mode supports:

- pull cloud book snapshot,
- store local working copy,
- queue local offline edits,
- push changes through BookForge API endpoints,
- pull cloud changes,
- record conflicts,
- inspect accepted AI revisions and review notes,
- later trigger cloud AI jobs.

BookForge Cloud is the source of truth for linked books.

## Preferred Sign-In Flow

1. User opens CreativeWriter.
2. User signs into BookForge account.
3. Cloud issues a scoped sync token or session.
4. User chooses an existing cloud book or creates a new one.
5. CreativeWriter stores linked project identity locally.
6. CreativeWriter pulls an initial snapshot and sync cursor.

The exact auth implementation is deferred. The contract assumes an authenticated API boundary.

## Initial Pull Contents

A linked project pull should include:

- book metadata,
- chapters,
- scenes,
- paragraphs,
- Manuscript Blueprint / book bible,
- continuity metadata,
- timeline metadata,
- character/world/series notes,
- revision/version history summaries,
- accepted AI revisions,
- pending comments and review status,
- contributor assignments if permitted,
- sync cursor and cloud version.

## Local DB Model

CreativeWriter has its own local DB. It is an offline working store/cache, not the global source of truth once linked.

Suggested tables:

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

## Cloud Sync Ledger

Phase 4A adds cloud-side durability for linked CreativeWriter projects and sync push outcomes.

Cloud tables:

```text
creativewriter_sync_projects
  id
  book_id
  account_id
  local_project_id
  sync_cursor
  last_cloud_version
  device_label
  linked_at
  last_seen_at
  created_at
  updated_at

creativewriter_sync_events
  id
  sync_project_id
  book_id
  account_id
  local_change_id
  idempotency_key
  entity_type
  entity_id
  operation
  base_version
  local_version
  cloud_version
  status
  payload
  conflict_payload
  rejection_reason
  resolution_status
  resolved_payload
  resolution_note
  resolved_by
  resolved_at
  created_at
```

Ledger rules:

- Link and pull upsert `creativewriter_sync_projects`.
- Push checks `book_id/account_id/idempotency_key` before applying a local change.
- Applied changes are recorded with `status = applied`.
- Stale local changes are recorded with `status = conflict` and a persisted conflict payload.
- Unsupported changes are recorded with `status = rejected` and a rejection reason.
- Conflict resolution marks the conflict event with `resolution_status`, optional resolved payload, resolver, note, and timestamp.
- RLS ties ledger visibility and writes to BookForge book view/edit permissions.

## Version Model

Every syncable entity should carry:

- stable entity ID,
- entity type,
- base version seen by the local client,
- local version,
- cloud version after accepted sync,
- updated timestamp.

The cloud should reject or conflict when a pushed base version is older than the current cloud version and the cloud entity changed in a material way.

## Change Operations

Initial operation set:

- `create`
- `update`
- `delete`
- `reorder`
- `accept_revision`
- `reject_revision`
- `metadata_update`

Each queued change must include:

- operation,
- entity type,
- entity ID,
- base version,
- payload,
- client timestamp,
- idempotency key.

## Conflict Rules

Do not silently overwrite.

Required behavior:

- If only local changed, push.
- If only cloud changed, pull.
- If both changed, create a conflict record.
- If cloud has an AI rewrite, pull it as a revision/suggestion unless it is already accepted.
- If original imported text differs, do not mutate original text automatically.
- If order changed in both places, create an ordering conflict.

Conflict resolution must be explicit and auditable.

## Sync API Shape

Future endpoints can vary, but the contract should support:

```text
POST /api/creativewriter/sync/link
POST /api/creativewriter/sync/pull
POST /api/creativewriter/sync/push
POST /api/creativewriter/sync/resolve-conflict
```

Phase 1 implements TypeScript contract schemas only.

Phase 2 implements upload/download fallback route handlers, not live sync route handlers:

```text
GET /api/books/[bookId]/creativewriter-package
POST /api/creativewriter/packages
```

These routes prove the API boundary and package transfer shape without introducing local dirty queues, conflict resolution endpoints, or desktop sync sessions yet.

Phase 3 implements the first live sync API surface:

```text
POST /api/creativewriter/sync/link
POST /api/creativewriter/sync/pull
POST /api/creativewriter/sync/push
```

Phase 3 behavior:

- `link` authenticates the user and returns an initial pull snapshot for a BookForge book.
- `pull` returns book/chapter/paragraph cloud changes, a sync cursor, and a cloud version.
- `push` accepts queued local changes, checks base versions against current cloud versions, applies supported updates, and returns conflicts/rejections for anything unsafe.
- CreativeWriter account ID in push payload must match the authenticated BookForge user.
- Cloud versions are currently deterministic timestamp versions derived from row `updated_at` values.
- Conflict records are returned to the caller but not persisted in a dedicated conflict table yet.

Phase 4A persists sync project state and push outcomes:

- `link` and `pull` upsert cloud linked-project state.
- `push` records applied, conflict, and rejected outcomes.
- `push` checks existing idempotency keys before applying a cloud write.
- Conflict payloads are now recoverable from the ledger.

Phase 4A still does not implement:

- conflict resolution endpoint,
- conflict review UI,
- create/delete/reorder operations,
- monotonic per-entity version table.

Phase 3 supported push operations:

- `update` for `book`
- `update` for `chapter`
- `update` for `paragraph`
- `metadata_update` is accepted by the schema but only applied where a supported entity handler exists

Phase 3 intentionally rejects or reports:

- create/delete/reorder operations,
- revision accept/reject operations,
- unsupported entity types,
- stale local base versions when cloud has changed.

Phase 4B implements conflict resolution:

```text
POST /api/creativewriter/sync/resolve-conflict
```

Phase 4B behavior:

- Authenticates through BookForge API.
- Rejects account mismatch between linked project and authenticated user.
- Locates unresolved conflict ledger events by `book_id`, `account_id`, and `conflict_id`.
- Supports `resolved_cloud` without mutating manuscript text.
- Supports `resolved_local` by applying the persisted local conflict payload.
- Supports `resolved_manual` by applying a supplied resolved payload.
- Marks ledger event resolution fields after successful handling.

Phase 4B intentionally does not add conflict review UI; it creates the cloud contract needed for that UI.

## Upload/Download Fallback

Account-linked sync is the preferred premium flow.

Upload/download remains necessary for:

- local-only users,
- backups,
- manual transfer,
- recovery if sync fails,
- compatibility with external writing tools.

## Factory Decisions

- Decision: CreativeWriter talks to BookForge API, not Supabase.
- Decision: local DB is an offline cache/working store for linked projects.
- Decision: sync cursors are opaque.
- Decision: conflict records are first-class data, not warning strings.
- Decision: API implementation waits until package and sync contracts are tested.
