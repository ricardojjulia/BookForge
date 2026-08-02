# CreativeWriter Phase 4I Evaluation

Date: 2026-08-02
Factory slice: Phase 4I Structural Version And Tombstone Foundation
Status: Complete for foundation, not complete for structural editing

## Objective

Close the first structural sync prerequisite from `creativewriter-structural-conflict-design.md`: add durable structure versions and tombstone storage before any CreativeWriter manuscript create, delete, or reorder operation is applied.

## Decisions

- Store `structure_version` directly on `books` for chapter-order scope.
- Store `structure_version` directly on `chapters` for paragraph-order scope.
- Use `creativewriter_structure_tombstones` for immutable CreativeWriter delete evidence.
- Keep runtime structural operations rejected until conflict tests exist for create placement, order conflicts, delete-update conflicts, and parent-child conflicts.
- Add typed paragraph structural payload contracts now so the next implementation slice can validate create, delete, and reorder payloads before service logic is enabled.

## Implemented

- Migration `202608020004_creativewriter_structural_foundation.sql`.
- `books.structure_version` and `chapters.structure_version`.
- `creativewriter_structure_tombstones` with RLS, book scoping, deleted-user evidence, parent scope, last known order/text, child ids, and metadata.
- Paragraph create/delete/reorder payload schemas in the sync contract.
- Focused contract tests for valid and invalid structural payloads.

## Explicit Non-Goals

- No CreativeWriter UI create/delete/reorder controls.
- No service application of structural operations.
- No hard delete behavior.
- No reorder conflict UI.
- No desktop local database migration.

## Factory Approval Notes

- Scope approval: completed as a foundation slice only.
- Data approval: completed for version columns and tombstone retention.
- API approval: partial, paragraph structural payload validators exist.
- Conflict approval: not complete, service conflict tests are still required.
- UI approval: unchanged, destructive and reorder controls remain hidden.
- Release approval: still controlled prototype only.

## Next Phase Recommendation

Phase 4J should implement paragraph create in the service layer only after adding:

1. Structure-version precondition checks.
2. Client-to-cloud paragraph id mapping.
3. Placement conflict behavior when the chapter structure version has advanced.
4. Ledger evidence for accepted creates and rejected stale creates.
5. Route and service tests before any UI control is exposed.
