# CreativeWriter Structural Conflict Design

Date: 2026-08-02
Factory slice: Phase 4F-R Structural Conflict Design
Status: Approved design gate, implementation blocked until next phase

## Purpose

CreativeWriter can currently update existing book, chapter, and paragraph content. It must not expose create, delete, or reorder manuscript operations until the cloud sync contract can preserve author work when local and cloud structure diverge.

This document defines the structural conflict model required before manuscript structure editing is enabled.

## Current Guardrail

Current behavior remains correct:

- `create`, `delete`, and `reorder` operations validate at the schema layer.
- The push service rejects those operations.
- Rejections are persisted in `creativewriter_sync_events`.
- No manuscript rows are mutated for rejected structural operations.

This prevents a local CreativeWriter client from silently creating, deleting, or reordering BookForge manuscript structure before the conflict model is ready.

## Structural Entities

Initial structural scope:

- `chapter`
- `scene`
- `paragraph`

Out of initial structural scope:

- Notes, research, and bible records.
- Revision accept/reject operations.
- Comments and collaborator review state.
- Bulk import replacement.

## Operation Payload Contracts

### Create Chapter

Required payload:

- `clientEntityId`: local temporary id.
- `chapterNumber`: intended order.
- `title`
- `summary`
- `currentText`
- `afterChapterId` or `beforeChapterId`

Cloud result:

- Creates a cloud chapter id.
- Returns an id mapping from `clientEntityId` to cloud id.
- Reorders affected chapters only if base order still matches.

### Create Paragraph

Required payload:

- `clientEntityId`: local temporary id.
- `chapterId`: cloud chapter id or mapped local id.
- `paragraphNumber`: intended order.
- `currentText`
- `afterParagraphId` or `beforeParagraphId`

Cloud result:

- Creates a cloud paragraph id.
- Returns an id mapping from `clientEntityId` to cloud id.
- Reorders affected paragraphs only if base order still matches.

### Delete Chapter Or Paragraph

Required payload:

- `deletedAt`
- `knownChildIds` for chapter deletes.
- `lastKnownText` for paragraph deletes.
- `deleteReason`

Cloud result:

- Soft delete should be preferred for the first implementation.
- Hard delete is allowed only after tombstone retention exists.

### Reorder Chapter Or Paragraph

Required payload:

- `parentId`: book id for chapters, chapter id for paragraphs.
- `orderedIds`: complete sibling order after the local change.
- `baseOrderedIds`: complete sibling order observed by the client before the local change.

Cloud result:

- Applies only if cloud sibling order equals `baseOrderedIds`.
- Otherwise creates an `order` conflict.

## Required Version Model

Timestamp-derived entity versions are not enough for structure. Structural sync needs a monotonic version per ordered scope:

- Book structure version for chapter order.
- Chapter structure version for paragraph order.
- Entity content version for chapter/paragraph text.

Minimum schema addition:

- `book_structure_versions`
  - `book_id`
  - `scope_type`: `book` or `chapter`
  - `scope_id`
  - `version`
  - `updated_at`

Alternative:

- Add `structure_version` directly to `books` and `chapters`.

Decision:

- Prefer direct `structure_version` columns for the first implementation because the initial scope is only book chapter order and chapter paragraph order.

## Conflict Types

### Order Conflict

Occurs when:

- Local `baseOrderedIds` does not match current cloud order.
- Two clients reorder the same sibling set concurrently.
- Local reorder references a deleted or newly inserted sibling not known at base time.

Resolution options:

- Keep cloud order.
- Use local order if all ids still exist.
- Manual order merge.

### Delete-Update Conflict

Occurs when:

- Local deletes an entity changed in cloud after base version.
- Local updates an entity deleted in cloud.
- Local reorders an entity deleted in cloud.

Resolution options:

- Keep delete.
- Restore/update entity.
- Manual restore with edited text and position.

### Create-Create Collision

Occurs when:

- Local creates a chapter/paragraph at a position where cloud inserted new material after base version.

Resolution options:

- Insert local item after cloud inserts.
- Insert local item before cloud inserts.
- Manual order merge.

### Parent-Child Conflict

Occurs when:

- Local creates or updates a paragraph under a chapter deleted or reordered materially in cloud.
- Local deletes a chapter while cloud changed one of its paragraphs.

Resolution options:

- Keep cloud parent and apply child change.
- Keep delete and archive child change in conflict payload.
- Manual restore under selected chapter.

## Resolution Requirements

Before UI exposure, the resolve route must support:

- Manual merged sibling order.
- Manual create placement.
- Restore from delete conflict.
- Mapping local temporary ids to cloud ids.
- Tombstone-aware conflict resolution.

The conflict UI must show:

- Local order and cloud order side by side.
- Added, deleted, and moved items.
- A manual order editor for the affected sibling scope.
- Clear warnings before accepting destructive delete outcomes.

## Ledger Requirements

`creativewriter_sync_events` must continue to record:

- Original local payload.
- Cloud payload at conflict time.
- Resolution status.
- Resolved payload.

Structural implementation must add:

- `entity_path` in payloads for readable context.
- `base_ordered_ids` and `cloud_ordered_ids` for order conflicts.
- `client_entity_id` and `cloud_entity_id` mapping metadata for create operations.
- Tombstone metadata for delete operations.

## Approval Gates Before Implementation

- Schema approval: structural versioning and tombstone strategy are selected.
- API approval: create/delete/reorder request and response payloads are typed and tested.
- Conflict approval: order, delete-update, create-create, and parent-child conflicts have service tests.
- UI approval: destructive actions are hidden until the conflict review UI can explain outcomes.
- Data approval: no hard delete is exposed before tombstone retention exists.
- Browser approval: local seeded manuscript proves reorder conflict visibility before broader use.

## Recommended Implementation Sequence

1. Add structure version fields and tombstone strategy.
2. Extend sync schemas with structural payload validators.
3. Implement create paragraph only, behind internal UI controls.
4. Implement paragraph reorder with order conflicts.
5. Implement soft delete paragraph with delete-update conflicts.
6. Repeat for chapters.
7. Add visual order conflict review.
8. Only then expose create/delete/reorder controls in CreativeWriter.

## Phase 4F-R Verdict

Do not expose manuscript create, delete, or reorder controls yet. The current rejection behavior is correct and now has explicit regression coverage. The next implementation phase should start with schema/versioning and paragraph-only structure operations behind internal controls.
