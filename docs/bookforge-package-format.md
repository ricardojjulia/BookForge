# BookForge Package Format

Last updated: 2026-08-02
Factory slice: CreativeWriter Phase 1

## Purpose

The `.bookforge` package is the interchange contract between BookForge CreativeWriter, BookForge Cloud, and future BookForge Personal builds.

It exists so an author can:

- write locally without a cloud account,
- preserve manuscript structure outside Supabase,
- upload a local project to BookForge Cloud,
- download a cloud book back to local storage,
- round-trip accepted revisions and metadata without flattening the book into one text blob,
- keep notes, research, book bible data, and sync metadata separate from manuscript prose.

## Product Boundary

BookForge Cloud remains the server-side source of truth for linked accounts. CreativeWriter must not connect directly to Supabase. Cloud-linked packages sync through BookForge API endpoints that enforce authentication, permissions, validation, and version rules.

Local-only packages can be opened and saved without an account. Once linked, the local package becomes an offline working copy with sync metadata and conflict records.

## Logical Layout

The package is a logical folder. It may later be stored as a real directory, zip archive, or platform-specific package bundle.

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

Phase 1 implements this as an in-memory logical package:

- manifest object,
- manifest entry content for `bookforge.yml`,
- package entries with paths, kind, content, and optional metadata.

Phase 2 exposes the logical package through authenticated JSON API endpoints. It does not write a zip archive yet.

## Manifest

`bookforge.yml` is the human-readable manifest. The TypeScript contract validates the same data as a structured object before any file-writing concern is introduced.

Required manifest fields:

```yaml
formatVersion: "1"
packageId: "pkg_local_..."
createdAt: "2026-08-02T00:00:00.000Z"
updatedAt: "2026-08-02T00:00:00.000Z"
mode: "local_only"
book:
  title: "Untitled Book"
```

Optional manifest fields:

```yaml
book:
  bookforgeBookId: "cloud-book-id"
  authorName: "Author Name"
  language: "en"
  status: "draft"
cloud:
  accountId: "user-id"
  bookId: "cloud-book-id"
  syncCursor: "opaque-cursor"
  lastCloudVersion: 12
  linkedAt: "2026-08-02T00:00:00.000Z"
```

## Package Modes

| Mode | Meaning |
|---|---|
| `local_only` | Local project without a linked BookForge Cloud book. |
| `cloud_linked` | Local working copy linked to a BookForge Cloud book. |

`cloud_linked` packages must include a cloud identity block. Local-only packages must not pretend to be the cloud source of truth.

## Entry Kinds

| Kind | Path prefix | Purpose |
|---|---|---|
| `manifest` | `bookforge.yml` | Package identity and mode. |
| `manuscript` | `manuscript/*.md` | Ordered book prose. |
| `note` | `notes/*.md` | Author notes and planning notes. |
| `research` | `research/**` | Source material, excerpts, references. |
| `bible` | `bible/*.md` | Characters, world, timeline, style, continuity. |
| `metadata` | `metadata/*.json` | Structured outline, scenes, revisions, sync, conflicts. |
| `export` | `exports/**` | Generated manuscripts and publishing artifacts. |

## Manuscript Files

Manuscript files should be deterministic and sortable:

```text
001-opening.md
002-arrival.md
003-chapter-3.md
```

Rules:

- Prefix with a zero-padded chapter number.
- Use a lowercase ASCII slug.
- Fall back to `chapter-N` when the title is empty.
- Do not use path separators from user input.
- Preserve chapter order by filename prefix.

Suggested Markdown shape:

```markdown
---
bookforgeChapterId: "chapter-id"
chapterNumber: 1
title: "Opening"
summary: "Optional summary."
---

# Opening

First paragraph.

Second paragraph.
```

The current import parser preserves frontmatter as metadata and removes it from the editable body. It does not require a YAML dependency in Phase 1.

## Text Source Rules

When exporting from BookForge Cloud to a package:

1. Prefer accepted text when the export source is `accepted`.
2. Prefer current text when the export source is `current`.
3. Fall back to original text if the chosen layer is empty.
4. Preserve original IDs in frontmatter where possible.

The package format must preserve BookForge's existing principle: original imported manuscript text is protected. Local edits should be represented as versioned/current manuscript work, not silent mutation of original text.

## Metadata Files

Initial metadata files:

- `metadata/outline.json`: chapter/scene ordering and high-level plan.
- `metadata/scenes.json`: scene boundaries and scene-level metadata.
- `metadata/continuity.json`: timeline, character, setting, motif, and rule data.
- `metadata/revisions.json`: accepted/pending/rejected revision references.
- `metadata/sync.json`: sync cursor, cloud version, local dirty queue summary.

The metadata shape can evolve. Version every metadata payload and preserve unknown fields where possible.

## Sync Metadata

Cloud-linked packages should store sync identity in both:

- manifest cloud block, for package-level identity,
- `metadata/sync.json`, for richer operational state.

Sync cursors are opaque. Do not parse or derive meaning from them in CreativeWriter.

## Conflict Records

Conflict metadata belongs in `metadata/sync.json` or a later `metadata/conflicts.json` file.

Conflict rules:

- If only local changed, push local change.
- If only cloud changed, pull cloud change.
- If both changed, create a conflict record.
- Do not silently overwrite local or cloud manuscript content.
- Cloud AI rewrites should arrive as suggestions/revisions unless explicitly accepted.

## Import Rules

BookForge Cloud import should:

1. Validate the manifest.
2. Sort manuscript files by numeric prefix, then path.
3. Parse frontmatter when present.
4. Treat the remaining Markdown body as chapter prose.
5. Split chapter prose into scenes/paragraphs using BookForge manuscript parsing rules in later integration.
6. Preserve notes, research, bible, and metadata entries.
7. Reject unsafe paths, missing manifests, invalid modes, or duplicate cloud identities.

Phase 1 implements logical import parsing only. It does not write to Supabase.

Phase 2 adds cloud upload:

```text
POST /api/creativewriter/packages
```

The request body accepts:

```json
{
  "projectName": "Optional project name",
  "package": {
    "manifest": {},
    "entries": []
  }
}
```

The server validates the logical package, creates a normal BookForge project/book, parses manuscript files into chapters/scenes/paragraphs, and stores package import evidence as a `creativewriter_package_import` report.

Phase 2B adds direct import intake:

```text
POST /api/creativewriter/import
```

The request is multipart form data:

```text
files       one or more uploaded files
title       optional title override
authorName  optional author
projectName optional project name
source      auto | document | markdown_folder | novelwriter | manuskript | joplin | zettlr | logseq | obsidian | wavemaker | bibisco | quollwriter
```

The route converts supported inputs to a logical `.bookforge` package, then imports that package through the same cloud upload path.

Supported direct formats:

- TXT
- Markdown
- Org-mode text
- DOCX
- PDF with extractable text
- EPUB
- Kindle KPF/KCB best effort
- RTF best effort
- `.bookforge.json`
- Wavemaker `.wmProj` JSON

Supported best-effort archive/folder formats:

- zip archives with readable text entries,
- novelWriter text projects (`.nwd`, Markdown/text entries),
- Manuskript `.msk` zip-style projects,
- bibisco `.bibisco2` archives when readable entries are present,
- Markdown folders from Zettlr, Logseq, Obsidian, Joplin Markdown export, or similar tools.

Not yet directly supported:

- legacy `.doc` binary Word files,
- Joplin `.jex` tar archives,
- SQLite/database-native project files without an official text export.

## Export Rules

BookForge Cloud export should:

1. Validate source book/chapter/paragraph rows.
2. Build a manifest.
3. Generate deterministic manuscript filenames.
4. Write one Markdown file per chapter.
5. Preserve chapter IDs and paragraph order in metadata where practical.
6. Include notes/research/bible metadata in later phases.

Phase 1 exports a logical package representation only. It does not write a zip.

Phase 2 adds cloud download:

```text
GET /api/books/[bookId]/creativewriter-package?sourceMode=accepted|current|original
```

The response returns a logical package JSON payload plus a suggested `.bookforge.json` download name. Downloaded cloud packages include sync metadata and revision metadata when available.

## Versioning

Package format versions are string literals.

Current version:

```text
1
```

Breaking format changes must increment the package format version and provide migration guidance.

## Security Notes

- Package paths must be relative.
- Package paths must not contain `..`.
- Package paths must not start with `/`.
- Package import must not execute embedded content.
- Cloud-linked sync must use BookForge API authorization, not direct Supabase credentials.

## Factory Decisions

- Decision: implement logical package helpers before zip/folder persistence.
- Decision: keep manifest validation in TypeScript/Zod so future API and desktop clients share the same contract.
- Decision: keep novelWriter as a compatibility target and reference product, not a dependency.
- Decision: defer UI and desktop shell until package and sync contracts are stable.
