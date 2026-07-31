# Book Metadata Timeline - Implementation Plan

## 1. Goal
Create a versioned metadata system for each book so critic/rewrite runs are reproducible, directional, and recoverable after exploratory work.

This plan introduces:
- Metadata snapshots (time-based + branch-aware)
- Explicit run-to-snapshot linkage
- Decision ledger (accept/reject/postpone)
- Active snapshot controls (promote, fork, archive, delete)
- Stage-gated rollout to avoid system disruption

## 2. Product Outcomes
1. Team can answer: "What was the plan at this moment?"
2. Critic runs can be replayed against exact metadata context.
3. Users can continue from a baseline (build on) or fork strategy (build out).
4. Drift across runs is reduced because execution context is explicit and selectable.

## 3. Scope
### In scope
- Data model for metadata snapshots and decisions
- API support for snapshot lifecycle and run linkage
- Minimal UI timeline and active-snapshot controls
- Enforcement: critic/rewrite runs must use a snapshot id
- Audit/history and soft retention policies

### Out of scope (later)
- Semantic merge automation between branches
- Full visual diff editor for large JSON documents
- AI conflict resolution between competing branches

## 4. Canonical Metadata Model
Metadata object should carry:
- Purpose statement
- Primary objectives and success criteria
- Rewrite strategy and constraints
- Critic recommendations and status
- Prioritized tasks/work items
- Change rationale and owner

Represent metadata as versioned JSON + normalized indexes for search/reporting.

## 5. Proposed Data Model (Stage 1)
### 5.1 Tables
1. `book_metadata_snapshots`
- `id` uuid pk
- `book_id` uuid fk
- `branch_name` text (default: `main`)
- `parent_snapshot_id` uuid nullable (fork lineage)
- `status` text (`draft`, `active`, `archived`)
- `title` text
- `summary` text
- `metadata_json` jsonb
- `source_type` text (`initial_plan`, `critic_update`, `manual_edit`, `system_merge`)
- `source_ref_id` uuid nullable
- `created_by` uuid
- `created_at` timestamptz
- `updated_at` timestamptz
- `archived_at` timestamptz nullable

2. `book_metadata_decisions`
- `id` uuid pk
- `book_id` uuid fk
- `snapshot_id` uuid fk
- `decision_type` text (`accept`, `reject`, `postpone`, `custom`)
- `subject_type` text (`recommendation`, `task`, `objective`, `constraint`)
- `subject_ref` text
- `rationale` text
- `created_by` uuid
- `created_at` timestamptz

3. `book_metadata_branches`
- `id` uuid pk
- `book_id` uuid fk
- `name` text
- `head_snapshot_id` uuid
- `is_default` boolean
- `created_by` uuid
- `created_at` timestamptz

### 5.2 Existing table linkage
Add nullable `metadata_snapshot_id` to execution tables used for critic/rewrite orchestration:
- `revision_jobs`
- `coherence_reports` (where applicable)
- Any run records that represent critic execution cycles

## 6. API Plan
### Stage 2 endpoints
1. `GET /api/books/[bookId]/metadata/snapshots`
- filters: branch, status, limit, cursor

2. `POST /api/books/[bookId]/metadata/snapshots`
- create snapshot (manual/system)

3. `POST /api/books/[bookId]/metadata/snapshots/[snapshotId]/activate`
- promotes snapshot as active for target branch

4. `POST /api/books/[bookId]/metadata/snapshots/[snapshotId]/fork`
- creates branch + child snapshot

5. `POST /api/books/[bookId]/metadata/snapshots/[snapshotId]/archive`

6. `DELETE /api/books/[bookId]/metadata/snapshots/[snapshotId]`
- policy-bound delete (soft delete initially)

7. `POST /api/books/[bookId]/metadata/decisions`
- append decision ledger item

8. Run execution APIs (`tool-run`, critic launch, rewrite launch)
- require explicit `metadataSnapshotId` (or resolve active snapshot deterministically)
- persist linkage into run records

## 7. UI Plan
### Stage 3 surface
Add a new panel in book workspace:
- Active Snapshot card (title, branch, created_at, summary)
- Timeline list (latest snapshots with status chips)
- Actions: Activate, Fork, Archive, Delete
- Run controls include selected snapshot

### Stage 4 UX quality
- Snapshot compare drawer (summary + key field differences)
- Decision ledger timeline grouped by subject
- "Build on" and "Build out" explicit action labels

## 8. Execution Rules
1. No critic/rewrite run without resolved snapshot context.
2. Resolution order:
- explicit request snapshot id
- active snapshot on selected branch
- fail with actionable message if none exists
3. Each run stores snapshot id and branch name.
4. Output artifacts include snapshot reference for reproducibility.

## 9. Migration + Rollout Strategy
### Stage A - Foundation (safe, additive)
- Create new metadata tables
- Add nullable linkage columns to run tables
- Backfill one initial snapshot per active book

### Stage B - API enablement
- Implement snapshot CRUD/fork/activate/archive
- Add decisions endpoint
- Add permission + RLS policies

### Stage C - Execution integration
- Update critic/rewrite launch payloads to carry snapshot id
- Persist snapshot references in jobs/reports
- Add backward-compatible fallback to active snapshot

### Stage D - UI timeline MVP
- Render snapshot timeline and active snapshot controls
- Add run picker/select for snapshot context

### Stage E - Hard enforcement
- Turn warning into requirement for unresolved snapshot contexts
- Add telemetry for run context quality

## 10. Testing Strategy by Stage
### Database
- Migration tests for constraints, indexes, FK integrity
- RLS tests: view/edit by collaborator roles

### API
- Contract tests for snapshot lifecycle
- Negative tests for missing/invalid snapshot resolution
- Idempotency tests for activate/fork operations

### UI
- Timeline rendering and state transitions
- Snapshot selection affects run requests
- Error state messaging for missing snapshot context

### End-to-end
- Create baseline snapshot -> run critic -> fork -> run critic on fork -> compare provenance

## 11. Acceptance Criteria
1. Every critic/rewrite run references a metadata snapshot id.
2. User can switch active snapshot and see it reflected in subsequent runs.
3. User can fork a branch and continue independently.
4. Decision ledger records recommendation handling with rationale.
5. System can reconstruct "what plan was in effect" for any run.

## 12. Risks and Controls
1. Risk: Snapshot sprawl
- Control: archive defaults + branch naming rules + retention policy

2. Risk: User confusion around branches
- Control: default branch and simple labels (Build on / Build out)

3. Risk: Runtime breakage in existing run flows
- Control: staged rollout with active-snapshot fallback before hard enforcement

4. Risk: Increased payload size
- Control: snapshot summary columns + lazy load full metadata_json

## 13. Stage Plan (Implementation Order)
### Stage 1 (DB + migrations)
- Create snapshot/branch/decision schema
- Add run linkage columns
- Backfill initial snapshot per book

### Stage 2 (APIs)
- Snapshot list/create/activate/fork/archive/delete
- Decision append endpoint

### Stage 3 (Run integration)
- Require/resolve snapshot on critic/rewrite launch
- Persist snapshot references in outputs

### Stage 4 (UI MVP)
- Active snapshot card
- Timeline list and controls
- Run snapshot selector

### Stage 5 (Compare + governance)
- Snapshot compare view
- Retention and deletion policy UX
- Usage telemetry and quality dashboards

## 14. Definition of Done (Plan Phase)
This planning phase is complete when:
- Stakeholders approve table design and stage boundaries
- We lock Stage 1 and Stage 2 payload contracts
- We freeze run resolution rule order
- We agree on branch UX language (Build on / Build out)

## 15. Immediate Next Step
Start Stage 1 only:
- Write migration for metadata tables and run linkage columns
- Add RLS policies
- Add migration test checklist and verify no regressions

## 16. Execution Status
Stage 1 foundation migration has been created.

Stage 2 API routes have been added for snapshot listing, creation, activation, forking, archiving, deletion, and decision logging.

Stage 3 execution integration has been added for rewrite-plan and critic batch launches. Those jobs now resolve or accept a metadata snapshot and persist its id into job/report records.

Stage 4 UI timeline MVP has been added on the book dashboard with snapshot selection, creation, activation, forking, archiving, and deletion controls. The selected snapshot is now threaded into the main critic and rewrite launch paths.

Stage 5 compare/governance UX has been added to the timeline panel with snapshot comparison and policy guidance for archive/delete handling.

Next checkpoint:
- Add telemetry and dashboard quality metrics for snapshot-driven runs
- Then consider decision-ledger timeline expansion
