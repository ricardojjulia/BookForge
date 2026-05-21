# Project Status

Last updated: 2026-05-21.

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
- Collaboration panel (invite, roles).

## Known Limits

- User account management (profile edit, password change, delete account) is not yet built — Supabase Auth handles login but there is no UI for account changes.
- Long AI jobs are still request-bound; no durable background worker yet.
- KPF/KCB support is best-effort.
- Automated test coverage is minimal.

## What Is Next

1. User account management UI (highest priority — noted as a gap).
2. Job history screen.
3. Export styling and metadata controls.
4. Improved collaborator workflows.
5. Automated tests for parsing, rewrite planning math, and export assembly.
