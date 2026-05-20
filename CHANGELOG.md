# Changelog

## 0.3.0 - 2026-05-19 (in development)

- Manuscript search — full-text search across all chapters and scenes.
- Author Voice Capture — AI voice fingerprint extraction injected into rewrite prompts.
- Character / Location / Theme UI — full CRUD editor for all five world-building entity types.
- Chapter Snapshots — named checkpoints with one-click restore before major rewrite passes.
- Onboarding checklist — first-run guided flow tracking progress through the core workflow.
- Beta Reader Mode — read-only collaborator view with inline paragraph annotations.
- Series Bible — series-level container with cross-book character and world-building continuity.
- Revision Statistics Dashboard — per-chapter and per-book metrics on acceptance rates, word count delta, and revision mode breakdown.
- Collaboration UI — invite by email, role management (viewer / editor / admin), and access revocation.

## 0.2.0 - 2026-05-19

- Cloud provider support: OpenAI, Anthropic, and Google via OpenAI-compatible SDK routing.
- Execution mode setting: Auto (cloud for critic/planning, local for rewrite/extraction), Local only, Cloud only.
- `selectAndPrepareActiveModel` unified entry point — all 11 AI routes now use a single dispatch function.
- FINISHED book status — mark a specific export as the finished version; one-click download from the dashboard.
- `mark-finished` API route with ownership and export-completion validation.
- Book dashboard FINISHED card: green badge, direct download button, signed URL generated server-side.
- LM Studio model orchestrator with scoring logic for task-fit, context size, loaded state, and model family.
- Runtime limits module for context budget calculation.
- LM Studio model fallback selection with candidate scoring and unload of unused loaded models.
- Standard LLM provider migration (`llm_provider`, `llm_api_key`, `llm_model`, `llm_base_url`, `llm_temperature`, `llm_max_output_tokens`).
- Execution mode migration (`execution_mode` column on `user_settings`).
- `finished_export_id` column on `books` referencing `exports`.
- Persistent AI Jobs panel with accurate progress tracking through `settings.progress` JSONB.
- Chapter delete from Structure Repair Assistant with sequential renumbering.
- Readiness status grid with per-card guidance text and action buttons on the rewrite plan page.
- Planning gate "Run missing critics" button linking to the readiness status section.
- Chapter draft generation `chapterText` prompt fix — model now writes prose instead of returning a placeholder.
- Zod coercion for `targetPages` and `targetWords` when model returns string instead of number.
- Model Status panel auto-refresh after saving settings via `forwardRef` + `useImperativeHandle`.
- Settings page client wrapper to coordinate settings form and model status refresh.
- Critic score synthesis producing readable summaries.
- Auto-review status route and auto-revision route.

## 0.1.0 - 2026-04-29

Initial BookForge AI local MVP snapshot.

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
- Public AI API usage is not implemented in this release.
