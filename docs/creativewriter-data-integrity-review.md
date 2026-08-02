# CreativeWriter Data Integrity Review

Date: 2026-08-02
Phase: 3R Factory Hardening
Status: Initial review

## Integrity Principles

- BookForge Cloud is the system of record after a CreativeWriter project is linked.
- CreativeWriter local storage is an offline working copy.
- `.bookforge` packages must be valid, portable, and inspectable.
- Sync must prefer explicit conflicts over implicit overwrites.
- Imports must land through normal BookForge rows so the rest of the product can use them.

## Current Guarantees

- Package manifests and entries validate through Zod.
- Package paths reject absolute paths, backslashes, empty path segments, `.`, and `..`.
- Package import creates standard `projects`, `books`, `chapters`, `scenes`, and `paragraphs`.
- Sync pull returns normalized book, chapter, and paragraph entity snapshots.
- Sync push supports updates to book, chapter, and paragraph entities.
- Sync push rejects unsupported operations and stale base versions.

## Data Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Timestamp-derived versions collide or reorder under high write frequency. | Conflicts could be missed or versions could be confusing. | Acceptable for current prototype; replace with durable monotonically increasing sync ledger. |
| Imported documents may split paragraphs differently than source tools. | Round-trip fidelity loss. | Import is positioned as best-effort intake; original files are not discarded by the user. |
| `.bookforge` packages can carry stale cloud metadata after offline work. | A client could attempt invalid pushes. | Push validates account and detects stale base versions. |
| Partial import failures could leave partial rows if the insert path fails mid-stream. | Incomplete cloud book. | Future work should wrap package insertion in a database transaction or durable job recovery step. |

## Required Next Integrity Work

- Add sync ledger tables for device links, idempotency keys, cloud versions, and persisted conflicts.
- Add transaction-level protection around package insertion.
- Add conflict resolution route and UI contract.
- Add import evidence rows with per-file warnings and source mapping.
