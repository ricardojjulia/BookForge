# CreativeWriter Security Threat Model

Date: 2026-08-02
Phase: 3R Factory Hardening
Status: Initial threat model

## Assets

- Book manuscripts, chapters, paragraphs, notes, and metadata.
- User account identity and BookForge ownership boundaries.
- Local/cloud link metadata stored in `.bookforge` packages.
- Import artifacts from third-party writing tools.

## Trust Boundaries

- CreativeWriter desktop client is trusted as a user-owned local app, but all requests are still treated as untrusted at the API boundary.
- BookForge API routes are the only supported cloud bridge.
- Supabase RLS remains the final database authorization layer.
- Uploaded documents and archives are untrusted input.

## Threats And Controls

| Threat | Risk | Current Control | Remaining Work |
| --- | --- | --- | --- |
| Cross-account sync push | A client could push changes for another account. | Push route rejects linked-project account mismatch and Supabase RLS scopes row access. | Add signed link tokens or device registrations before GA sync. |
| Malformed package upload | Bad package JSON could create invalid project rows. | Logical packages validate through Zod before insertion. | Add package signing or checksum metadata for cloud-linked packages. |
| Import denial of service | Large file batches or archives could exhaust server resources. | Import count, file size, archive entry, entry text, and total extracted text limits. | Move large import work to durable jobs. |
| Archive path traversal | Archive entries could escape expected package paths. | Archive paths must be relative, slash-normalized, and cannot contain `..`. | Add zip bomb heuristics before broad beta. |
| Silent overwrite | Stale offline edits could overwrite cloud text. | Push returns explicit conflicts for stale base versions. | Add durable conflict records and UI resolution workflow. |
| Unsupported format ambiguity | Users may assume proprietary imports are complete. | Import warnings identify unsupported or best-effort formats. | Add UI disclosure and per-format import reports. |

## Security Decision

Phase 3R is suitable for internal and controlled test use. It is not yet suitable for broad SaaS release because sync has no durable device/link registry, import does not run in a background isolation boundary, and conflicts are response-only rather than persisted.
