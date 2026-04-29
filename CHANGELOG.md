# Changelog

## 0.1.0 - 2026-04-29

Initial BookForge AI local MVP snapshot.

### Added

- Next.js, React, TypeScript, Mantine, Tailwind, Supabase, and LM Studio foundation.
- Supabase migrations with RLS, storage buckets, auth profile/project/book/revision structures, rewrite workflow tables, and creation project tables.
- Manuscript import for TXT, Markdown, DOCX, EPUB, KPF/KCB best-effort, pasted manuscripts, and manual chapters.
- Book dashboard, chapter browser, structure audit, chapter repair tools, and scene editor.
- Manuscript Blueprint generation/editing.
- BookForge Critic scored evaluator with saved reports and readable report cards.
- Chapter summaries with weak-summary health checks and regeneration.
- Rewrite Architect with model evaluation, coherence contract, guided workflow, and draft rewrite execution.
- Revision Review with accept/reject/rerun/batch actions and full rewrite reset.
- Final Manuscript Builder with Markdown, DOCX, EPUB, and PDF export.
- Abridged Edition Builder.
- Creation Wizard with concept generation, architecture generation, and accept-architecture book creation.

### Notes

- AI execution is local through LM Studio by default.
- Original manuscript text is preserved.
- Public AI API usage is not implemented.
