# Project Status

Last updated: 2026-06-02.

## v0.3.0 Kickoff (Scaffold)

Branch: `feat/v0.3.0-next`

Planning state:

- Scope definition in progress.
- Epics and acceptance criteria pending confirmation.
- Execution plan and milestone dates pending.

Initial target areas for v0.3.0:

1. Production-hardening for reliability and observability.
2. Durable background processing and job-history visibility for long-running AI workflows.
3. Author and collaborator workflow quality-of-life improvements.
4. Admin/course domain execution from ADR-0001.

## What Is Up

BookForge AI is a working local-first manuscript studio covering the full author workflow from raw idea to finished export. The end-to-end loop is proven: concept → architecture → draft generation → Auto-Review (critic, rewrite, drift check, re-critic) → export.

The app runs on Next.js 16 / Supabase / LM Studio and optionally routes AI calls to Anthropic, OpenAI, or Google for critic and planning tasks.

## What Has Been Done

- Full-stack foundation: Next.js 16, React 19, Mantine 9, Tailwind 4, Supabase, LM Studio.
- Manuscript import (TXT, MD, DOCX, EPUB, KPF/KCB best-effort, paste, manual).
- Structure audit and repair tools.
- Manuscript Blueprint (book bible) generation.
- BookForge Critic: seven scored lenses with saved reports and readable report cards.
- Chapter summaries with health checks and regeneration.
- Rewrite Architect with model evaluation, coherence contracts, guided workflow, and draft rewrite execution.
- Revision Review: accept / reject / rerun / batch / reset.
- Final Manuscript Builder: Markdown, DOCX, EPUB, PDF export.
- Abridged Edition Builder.
- Creation Wizard: concept → architecture → draft generation (full prose, scene/paragraph parsing, word-count targets).
- Architecture Roadmap panel: part/chapter progress view with expandable key beats and "next step" callout.
- Book Concept panel: approved concept surfaced on the book page, collapsible.
- Auto-Review Wizard: autonomous end-to-end pipeline with loop-until-green critic logic, resume after interruption.
- Cloud provider support: Anthropic, OpenAI, Google via execution mode setting (Auto / Local / Cloud).
- LM Studio model orchestrator: task-fit scoring, fallback selection, runtime limits.
- FINISHED book status with signed export download.
- Persistent AI Jobs panel.
- AI Jobs History page with stale-running visibility and priority ordering.
- Long-running analysis, chapter summary, critic, and draft-generation routes now persist periodic job heartbeats during model calls.
- The full-book rewrite executor now also persists periodic job heartbeats during model calls.
- Auto-review now has a server worker route plus a monitor-only wizard flow, so the orchestration is no longer client-bound.
- Planned draft generation now supports a queue-first handoff, so the initial request can create the job and the worker call can continue it asynchronously.
- Chapter summary generation now supports the same queue-first handoff pattern with job-resume processing.
- Manuscript Blueprint generation now supports queue-first job creation with worker-resume processing.
- Critic batch generation now supports queue-first job creation with worker-resume processing.
- Rewrite execution now supports queue-first job creation with worker-resume processing in the main rewrite execution panel.
- Guidance rewrites, revision-level rewrite-again actions, and persistent jobs retry/replacement flows now use queue handoff for queue-capable routes.
- Final manuscript export controls now persist EPUB/PDF metadata and style options in export records and prefill the builder from the latest export.
- Final manuscript builder now includes explicit "Use last export settings" and "Reset to recommended defaults" actions plus client/server guardrail validation for EPUB and PDF settings.
- Collaborator workflow now supports reviewer assignment and status transitions for revision review and rewrite approval (unassigned → assigned → in_review → approved/changes_requested).
- Collaboration notification hooks are now in place with in-app workflow notifications and optional email delivery when Resend is configured.
- Added test coverage for export metadata persistence, final manuscript builder prefill/reset/reapply behavior, and revision review assignment route transitions.
- Workflow notifications now support mark-read actions (single and mark-all) directly in the revisions page panel.
- Added route-test coverage for rewrite approval workflow permissions and assignment transitions.
- Added deterministic unit tests for rewrite plan parsing/default defaults and AI call-planner math/strategy behavior.
- Added first admin/course delivery slice: finished books can now publish mapped artifacts into course entities (courses/modules/lessons/assets) from Publishing Lab.
- Book-to-course mapping now includes chapter-summary lessons and course assets built from completed exports, matter sections, and chapter summaries with source traceability.
- Collaboration panel (invite, roles).
- Publishing Lab gateway: post-finish ultimate critic, consensus reporting, generated assets, and cover variants.
- Freshness UX foundation on key pages with stale/expired messaging and manual refresh controls.
- Freshness telemetry pipeline: lifecycle events emitted from UI and received by `/api/telemetry/freshness` for operational logging.
- Freshness automated test coverage: policy threshold math and banner refresh lifecycle behavior (manual and forced fallback).
- Freshness reliability analytics: dedicated `/api/analytics/freshness` endpoint with cursor drilldown, route/event/status filters, and paginated row inspection.
- Freshness SLO reporting and alerting: success/failure/forced-rate thresholds plus alert generation for repeated failures and forced-refresh loops.
- Software-factory execution artifacts: phased execution log, engineering TODO, and admin/course ADR.

## Known Limits

- The durable worker handoff now covers auto-review, planned draft generation, chapter summaries, Manuscript Blueprint generation, Critic batch generation, rewrite execution, and rewrite retry/replacement call sites in the UI.
- KPF/KCB support is best-effort.
- Automated test coverage is minimal.
- Freshness telemetry cleanup scheduling is currently function-based (`cleanup_freshness_events`) and still needs cron/job orchestration in production environments.

## What Is Next

1. Extend the durable worker pattern to the remaining long AI routes.
2. Expand collaborator workflows beyond rewrite/revision approvals (deeper handoff automation).
3. Automated tests for parsing and rewrite planning math.
4. Continue admin/course domain implementation from ADR-0001 (enrollments/progress/admin screens).
