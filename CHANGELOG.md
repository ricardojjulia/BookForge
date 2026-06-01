# Changelog

## 0.2.3 - 2026-06-01

### Reliability and Freshness

- Replaced corrupted architecture document with a clean software-factory aligned architecture source of truth.
- Added shared freshness policy helper (`fresh`, `stale`, `expired`) with 24h/48h thresholds.
- Added reusable freshness banner with manual refresh and one-shot forced refresh behavior for expired snapshots.
- Integrated freshness banner into key routes: dashboard, book dashboard, rewrite plan, final manuscript, analytics.
- Removed duplicate delayed `router.refresh()` burst in Studio Actions to reduce API pressure and transient fetch failures.
- Instrumented freshness telemetry lifecycle events in the banner (`attempt`, `success`, `failed`, `forced_triggered`) with a centralized server sink at `/api/telemetry/freshness`.
- Added Vitest-based automated coverage for freshness policy threshold math and banner lifecycle behavior (manual refresh + forced refresh failure fallback).
- Added persistent freshness telemetry table (`freshness_events`) with RLS and migration-backed indexes.
- Added analytics page freshness reliability section (24h event counts, route-level success/failure rates, latest failures).
- Added interactive freshness analytics filters (24h/7d + route) and mini trend bars for quick reliability signal checks.

### Software Factory Governance

- Added detailed phased execution log at `docs/SOFTWARE_FACTORY.md`.
- Added live engineering backlog at `docs/TODO.md`.
- Added domain decision record for admin-first and course-aware evolution at `docs/ADR-0001-admin-course-domain.md`.

## 0.3.0 - (planned)

- Manuscript search — full-text search across all chapters and scenes.
- Author Voice Capture — AI voice fingerprint extraction injected into rewrite prompts.
- Character / Location / Theme UI — full CRUD editor for all five world-building entity types.
- Chapter Snapshots — named checkpoints with one-click restore before major rewrite passes.
- Onboarding checklist — first-run guided flow tracking progress through the core workflow.
- Beta Reader Mode — read-only collaborator view with inline paragraph annotations.
- Series Bible — series-level container with cross-book character and world-building continuity.
- Revision Statistics Dashboard — per-chapter and per-book metrics on acceptance rates, word count delta, and revision mode breakdown.
- Collaboration UI — invite by email, role management (viewer / editor / admin), and access revocation.

## 0.2.2 - 2026-05-21

### Auto-Review Wizard

- Resume function: opening the wizard detects a previous failed or interrupted run and offers a "Resume" button. Completed stages are pre-marked done and skipped; the run continues from the first incomplete stage.
- Failed-state alert now includes a "Back to wizard to resume" button.
- Log output labels resumed stages with `↩ Resuming — skipping already-completed`.

### Creator Workflow

- Architecture Roadmap panel on the book page: shows the full part/chapter structure from the accepted architecture alongside live draft status per chapter. Chapters are expandable to show key beats and emotional arc. Includes a "Next step" callout (generate remaining chapters or run Auto-Review) so the path forward is always visible.
- Book Concept panel on the book page: surfaces approved concept metadata (main theme, premise, reader promise, emotional engine, creation thesis, genre fit, audience fit, suggested structure, core questions, differentiators, author risks). Collapsed by default with a "Show details" toggle.
- `toDisplayString` serializer handles concept fields that are objects or arrays instead of plain strings, preventing React child object errors.
- Draft generation word-count fix: prompt now includes explicit floor/ceiling word targets per chapter (80 % – 120 % of architecture target). `max_tokens` floor raised to 6 000 (was 2 048).
- Page auto-refresh after draft generation: `revalidatePath` server-side plus a delayed second `router.refresh()` client-side so the book page reflects generated chapters without a manual reload.

### Production Command Center

- Creator-book guidance: after all chapters are drafted the command center now points to "Run Auto-Review" rather than a manual Blueprint step.
- Removed confusing "Generate Blueprint" prompt for books that have no blueprint yet — Auto-Review generates it automatically.

### Revision Loop Fixes

- `rewrite_execute` field name corrected: runner now reads `rewritten` / `attempted` from the route response (was reading `unitsProcessed` / `processed`, causing the stage to always report zero and immediately exit).
- Paragraph count gate before `rewrite_execute`: skips the stage with a clear message when no manuscript paragraphs exist (freshly created books with unimported manuscripts).
- Preview gate before `auto_accept`: checks pending draft count before calling the auto-revision route; skips with "no pending drafts" if the rewrite produced nothing.

### Cloud Provider Fix

- Strip `top_p` from Anthropic API calls. Anthropic returns HTTP 400 when both `temperature` and `top_p` are present. `createManagedChatCompletion` now omits `top_p` when `preparedModel.isCloud` is true. The orchestrator sets `isCloud: true` on the cloud shim.

### Landing Page

- Updated Guardrails section copy to emphasise author control and opt-in usage of the toolkit.

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
