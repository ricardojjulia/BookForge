# BookForge AI Roadmap

This roadmap reflects the current local MVP as of April 29, 2026.

## Done

### Foundation

- Next.js 16, React 19, TypeScript, Mantine, and Tailwind foundation.
- Supabase browser/server clients.
- Supabase migrations for projects, books, collaborators, chapters, scenes, paragraphs, settings, revision jobs, revision versions, critic reports, exports, rewrite workflows, creation projects, and supporting tables.
- Row Level Security policies and helper functions for book ownership and collaborator access.
- Auth flow with Supabase email/password login and signup.
- Settings screen with LM Studio connection testing and task-specific model assignments.

### Import and Structure

- Import TXT, Markdown, DOCX, EPUB, and best-effort KPF/KCB.
- Paste full manuscript and manually add chapters.
- Preserve original manuscript text separately from revised text.
- Parse chapters, scenes, and paragraphs.
- Show chapter summaries, weak-summary health checks, and regeneration actions.
- Add structure audit warnings for repeated titles, empty/title-only chapters, very short chapters, and unusually long chapters.
- Add repair tools for chapter metadata, split/merge operations, and scene editing.

### Analysis

- Manuscript Blueprint generation and editing.
- BookForge Critic with saved reports, score dials, readable findings, and raw JSON behind a detail control.
- Critic lenses:
  - Story structure and stakes
  - Prose quality and voice
  - Continuity and timeline
  - Character depth and interaction
  - Market fit and reader promise
  - Theology / worldview alignment
  - Highest-leverage revision priorities
- Drift/coherence reporting after rewrite work.

### Rewrite

- Rewrite Architect screen.
- Model suitability evaluation against available LM Studio models.
- Human-readable rewrite plans with coherence contracts and context packets.
- Guided Rewrite Run wizard for new users, with veteran-friendly direct controls.
- Readiness gate that checks summaries, Critic coverage, model fit, plan presence, and reset state.
- Draft rewrite execution in small batches with spread coverage.
- Persistent rewrite workflow state.
- Campaign tracking and reset controls.
- Revision Review page with accept, reject, rerun, batch review, and reset actions.
- Abridged Edition Builder for shorter versions that retain the original idea.

### Export

- Final Manuscript Builder.
- Export Markdown, DOCX, EPUB, and PDF.
- Preserve chapter titles, paragraph breaks, scene breaks, locked passages, and accepted revision choices.

### Creation From Idea

- Dashboard entry point for creating a book from an idea.
- Creation Wizard with target length capped at 150 pages.
- Local model fit guidance, including single-model safe mode and dual-role sequential planning.
- Concept pass through LM Studio.
- Architecture pass through LM Studio.
- Accept Architecture route that creates a real BookForge project/book and planned chapters.

## Active Work

### Creation Wizard Phase 2

- Generate actual prose from the accepted architecture.
- Generate chapter by chapter, then scene or paragraph cluster when chapters are too large.
- Save generated units with prompt snapshots and provenance.
- Parse generated prose into scenes and paragraphs.
- Run baseline Manuscript Blueprint, chapter summaries, and BookForge Critic after draft creation.

### Persistent AI Jobs

- Move long-running work from request-bound routes toward a resumable worker-style loop.
- Add a dedicated job history screen.
- Add richer per-unit attempt history and failure diagnostics.
- Add retry support for failed Blueprint chunks, summaries, Critic jobs, and rewrite units.

### Revision Studio Polish

- Tighten the side-by-side editor workflow.
- Improve passage-level revision ergonomics.
- Add richer diff controls and clearer note handling.
- Keep original, current, accepted, and draft text visually distinct.

## Next

1. Finish Creation Wizard prose generation.
2. Add generated-draft parsing and automatic post-creation evaluation.
3. Improve model orchestration guidance for LM Studio memory limits and loaded models.
4. Add job history and durable background processing.
5. Expand export styling and metadata controls.
6. Add reference-material selection into prompts.
7. Improve collaborator workflows and permission-sensitive UI.
8. Add automated tests around parsing, export assembly, and rewrite planning math.

## Product Principles

- Never overwrite original text.
- Prefer more smaller AI calls over risky giant prompts.
- Preserve coherence, continuity, author voice, and character permanence.
- Make AI recommendations inspectable before execution.
- Keep authors in control of acceptance and export decisions.
- Store reference materials separately from manuscript text.
- Run local AI by default through LM Studio.
