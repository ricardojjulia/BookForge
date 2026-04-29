# Project Status

Last updated: April 29, 2026.

## What Is Up

BookForge AI is now a working local MVP for manuscript import, analysis, guided rewrite planning, draft rewrite review, and export. The app is optimized for an author running Supabase locally and LM Studio on a 16-inch MacBook Pro.

The major product direction is stable:

- import or create a book
- structure it into chapters/scenes/paragraphs
- build context with Blueprint, summaries, and Critic
- rewrite in controlled units
- preserve coherence and revision history
- export only what the author accepts

## What Has Been Done

- Built the full-stack foundation with Next.js, Mantine, Supabase, and LM Studio.
- Added database migrations, RLS, auth, storage, settings, model assignments, and local environment scaffolding.
- Added manuscript import and parsing for common author formats.
- Added structure audit and repair tools.
- Added Manuscript Blueprint and BookForge Critic.
- Added Rewrite Architect, model fit scoring, guided rewrite runs, draft rewrite execution, and revision review.
- Added export workflows for Markdown, DOCX, EPUB, and PDF.
- Added Creation Wizard concept and architecture passes from an idea prompt.

## What Is Next

The highest-value next tranche is Creation Wizard Phase 2:

1. Generate actual chapter prose from an accepted architecture.
2. Save generation prompt snapshots and generated units.
3. Parse generated prose into scenes and paragraphs.
4. Run summaries, Blueprint, and BookForge Critic automatically.
5. Route the new draft into Rewrite Architect.

The second tranche is durable AI execution:

1. Add job history.
2. Add better retry and failure diagnostics.
3. Move long AI runs toward resumable worker-style processing.

## Known Limits

- Long AI jobs are still mostly request-bound.
- Creation Wizard creates a real planned book but does not yet generate the full prose draft.
- KPF/KCB support is best-effort because Kindle package internals vary.
- Local model quality depends heavily on what LM Studio has loaded.
- Automated test coverage still needs to be added around parsing, rewrite planning, and exports.
