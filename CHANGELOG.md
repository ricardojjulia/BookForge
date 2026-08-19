# Changelog

## 2.0.0 - 2026-08-19

### Language & script support

- Book language is now a free-text field (with common presets) instead of a fixed English/Spanish/Bilingual dropdown — the database column, API validation, and every AI prompt builder already accepted arbitrary language strings; the dropdown was the only real restriction.
- **Chapter-heading detection** extended from English/Spanish to also recognize French, Italian, Dutch, Polish, Romanian, and Tagalog chapter/prologue/epilogue keywords, plus a CJK counter-word pattern (`第3章`, `제1장`) for manuscripts that mark chapters without a "word + number" shape.
- **Dialogue-density scoring** now also counts guillemet-delimited (`« »`) and em-dash-led dialogue lines, not just straight/curly quotes — literary Spanish, French, and Italian prose was being scored as having almost no dialogue.
- **PDF export** no longer renders non-Latin-1 text as missing-glyph boxes. It now auto-detects a manuscript's dominant script and embeds the matching font: Open Sans by default (full Latin Extended, Cyrillic, Greek, Vietnamese, and Hebrew coverage), switching to Noto Sans Arabic or Noto Sans SC the moment Arabic or CJK text is detected. The ~10MB CJK font is lazy-loaded so an ordinary Latin-script export never pays its cost.
- **EPUB export** previously hardcoded `lang="en"` on every chapter's XHTML document regardless of the book's actual language — only the OPF package's `dc:language` was ever set correctly. Every document now carries the resolved language.
- Known open items, called out honestly rather than silently skipped: Arabic contextual letterforms and right-to-left reading order aren't corrected yet (glyphs render, order doesn't), and CJK word-count estimates still split on whitespace.

## 1.4.0 - 2026-08-18

### Design system rollout

Implemented a cohesive design spec (Inter font, brand-purple theme, icon-labeled navigation) across the entire app, extending it from an initial dashboard redesign to every major workflow:

- Global header/nav restyle, `My Book Room` rename, and a subtle freshness banner rolled out to every page that previously used the louder colored-alert version.
- Redesigned: dashboard, AI Settings' Model Status panel and Detected Match recommendations table, Studio Actions, Book Inputs (sidebar section nav replacing a horizontal tab list), the Manuscript page (Structure Repair / Structure Audit / Scene Editor collapsed into a "Manuscript Health" summary-card row), Metadata Timeline (row-list layout with overflow menus replacing per-row button clusters), Rewrite Setup (clickable critic-lens cards, chapter-selection chips), and Production Command Center / BookForge Critic (score rings, STRONG/SOLID/NEEDS WORK band pills, a new average/strongest/weakest summary row).
- Added icons and a filled active-pill style to the book sub-navigation bar.
- Every redesign preserved full existing functionality underneath — same modals, same job/queue logic, same API calls — only presentation changed.

## 1.3.0 - 2026-08-18

### Steward console — account lifecycle without an admin god-mode account

- Account deletion is now a **30-day recoverable ban**, not an immediate hard delete: the account is locked out right away, but nothing is destroyed until the retention window closes *and* a Steward explicitly confirms the purge. A daily job only flags accounts as due — it never deletes anything itself.
- Added a BookForge-specific **Steward** platform role (not a generic `is_admin` flag), with its own RLS foundation so staff access is auditable and scoped, not a service-role bypass.
- New Steward console: account search, restore, extend-retention, and purge-confirmation actions; per-account book counts and an owner-filtered book list; one-click book **ownership transfer**.
- Fixed export downloads for collaborators and staff, found while building the cross-book RLS path.
- Replaced every native `window.confirm`/`window.prompt` in the console with a real Mantine modal (type-to-confirm for deletes) after a live "prompt() is not supported" failure.
- Console entry point lives behind the username menu, not a top-level nav link.

## 1.2.0 - 2026-08-16 – 2026-08-18

### Focused Rewrite and job visibility

- Added **Focused Rewrite**: pick specific critic lenses, run a full-book rewrite plan → execute → accept → re-evaluate cycle targeted at just those lenses, with a resumable stepper if the browser tab closes mid-run.
- Added a global job-visibility indicator so a long-running AI job stays visible while navigating away from the page that started it.
- Fixed Structure Repair no-ops, several critic/chapter edge-case bugs, a chat message de-duplication bug, and durability gaps in job tracking.
- Fixed Auto-Review silently reverting a finished book back to draft status, and a split-chapter operation leaving later chapters' titles out of sync.
- CreativeWriter: added inline paragraph editing in BookReader (reusing CreativeWriter's sync-push path), prev/next paragraph flow with adjacent-text previews, full-text-on-hover for clamped previews, and fixed a returning-visitor hydration mismatch.
- Fixed the chat copilot leaking internal `revisionDrafts` meta-labels into manuscript text, and a `DataFreshnessBanner` hydration mismatch on returning visits.

## 1.1.0 - 2026-08-10 – 2026-08-11

### Guided rewrite and reliability polish

- Added a **Guided** option to the Auto-Review Wizard and connected Guided Rewrite Run's steps with a visual progress timeline; every step's action button is now visible in manual mode too.
- Grounded the AI Job Queue panel in real server-reported progress instead of a client-side time-based simulation, and fixed the background-job heartbeat clobbering `taskName`/`startedAt` on its first tick.
- Fixed Retry Failed silently doing nothing after the real-progress work landed, and made rewrite calls retry once on a different cloud model before failing (plus corrected telemetry model attribution).
- Fixed the Rewrite Readiness Gate showing "Blocked" while every visible card was green, and made the Command Center's next-step guidance name the actual button to click.
- Made the Architecture Roadmap panel compact and graphical (with moderate motion) instead of a wall of text, and stopped its stale Auto-Review callout and dangling third button.
- Fixed the Creation Progress stepper showing false-done, and localized the working-title placeholder for non-English projects.
- Every new job-triggering button now gives resumable, live progress feedback instead of a bare spinner.

## 1.0.0 - 2026-08-06

### Six-phase structural revamp

A full-app restructuring, shipped in six sequential phases: a shared critic-lens progress module, a shared book-data loader with SWR poll deduplication, AppShell consolidated into a root layout with the book sub-navigation bar, the book hub page broken into proper route seams, the Guidance panel promoted and the onboarding wizard generalized, and a final cleanup/hardening/regression pass.

Shipped alongside the revamp:

- Gated the landing page's primary CTAs and manuscript import/creation on auth state.
- Added AI-suggested scene splits with per-item review, moved manuscript search from the hub page into Reader view, and added parser regression tests.
- Fixed PDF page-artifact leakage and two chapter-detection bugs; patched `js-yaml` for a high-severity quadratic-complexity DoS.
- Fixed the Spanish-language default and a stale AI-engine status display left over from onboarding.
- Removed several redundant/dead-end CTAs ("Run Auto-Review", a duplicate Architecture Roadmap Auto-Review button) once the Command Center made the same actions discoverable in one place.

## 0.5.0 - 2026-08-02

### BookForge CreativeWriter 0.1.0

- Added the first internal **BookForge CreativeWriter** prototype: an authenticated writing desk for linked BookForge manuscripts with book selection, chapter navigation, paragraph editing, word counts, dirty-draft state, and push/pull sync controls.
- Added `.bookforge` package contracts plus authenticated package download/upload routes for fallback cloud-to-local and local-to-cloud transfer.
- Added expanded CreativeWriter import intake for TXT, Markdown, Org text, DOCX, PDF, EPUB, RTF best effort, `.bookforge.json`, Wavemaker `.wmProj`, and readable archive exports from tools such as novelWriter, Manuskript, Zettlr, Obsidian, Logseq, Joplin Markdown export, Wavemaker, and bibisco-style archives.
- Added BookForge-aware sync APIs for link, pull, push, and conflict resolution through authenticated BookForge routes. CreativeWriter still does not connect directly to Supabase.
- Added durable CreativeWriter sync ledger tables, local migration, RLS policies, idempotency handling, applied/rejected/conflict event recording, and local Supabase verification harness.
- Added conflict review ergonomics: local/cloud payload comparison, editable manual merge text, and clearer actions for keeping cloud, using local, or applying a manual merge.
- Added read-only Notes, Research, and Bible support panels using existing BookForge author notes, reference materials, book bible, characters, locations, themes, motifs, and timeline notes.
- Added support-context search, search-aware tab counts, per-book pinned context cards, and a visible `CreativeWriter 0.1.0` release badge.
- Added structural conflict design and guardrails: create/delete/reorder operations remain rejected and ledgered until structure versioning, tombstones, and visual order conflict review are implemented.

### Software factory

- Added CreativeWriter factory artifacts covering architecture, API contracts, security, data integrity, failure modes, council review, release readiness, phase evaluations, and structural conflict design.
- Added authenticated browser verification and local Supabase data proof across the CreativeWriter prototype phases.

### World Bible discovery

- Added **Discover with AI** to populate characters, locations, themes, motifs, and timeline notes from the manuscript through the durable Blueprint workflow.
- Added per-book World Bible processing status and source hash plus AI provenance and idempotent discovery keys on normalized entities.
- Preserved author-owned entries during discovery; editing an AI-discovered entry now promotes it to manual ownership.

## 0.4.0 - 2026-08-01

### OpenRouter provider

- New cloud provider option: **OpenRouter** — one API key routes to hundreds of backend models (DeepSeek, Gemini, Claude, GPT, and more) via a single OpenAI-compatible endpoint. Added alongside the existing OpenAI/Anthropic/Google options in Settings and the onboarding wizard's Cloud step.
- New **per-task model overrides**: an "Optimize per feature" switch lets a user assign a different model to critic lenses, full-book rewrite passes, planning/architecture calls, and extraction/summaries — instead of one model for everything. Falls back to the single configured model for any task left blank. `selectAndPrepareActiveModel` resolves the right one per call.
- Curated default OpenRouter model catalog with cost-tier guidance (`docs/openrouter-integration-plan.md`): `google/gemini-2.5-flash-lite` for high-volume critic/extraction calls, `deepseek/deepseek-v4-pro` for full-manuscript rewrite passes (the actual cost driver), `anthropic/claude-haiku-4.5` for planning, plus opt-in premium options (`gpt-5-mini`, `gemini-2.5-pro`).
- New `llm_critic_model` / `llm_rewrite_model` / `llm_planning_model` / `llm_extraction_model` columns on `user_settings`, each falling back to `llm_model` when unset.
- Cloud provider connection test now sends a real minimal chat completion for OpenAI/Anthropic/Google/OpenRouter, rather than only supporting the LM Studio `/models` check.

### Rewrite reliability and speed

- **Empty-completion detection and retry**: found via load-testing that a Tier-B rewrite model (`deepseek/deepseek-v4-pro`) returned an empty completion on ~17% of full-manuscript rewrite calls. `rewrite-execute` now retries a paragraph up to 3 times before giving up, and a paragraph that still comes back empty is recorded as a real failure instead of silently keeping the original text under a generic "rewritten" label.
- Fixed a bug where a rewrite job's `failedUnits` list only ever kept the most recent failure — every subsequent successful paragraph overwrote it. Failures now accumulate for the whole run, so `retryJobId` can actually find and re-process everything that failed, not just the last one.
- **Bounded concurrency**: full-book rewrite execution now processes up to 5 paragraphs at once instead of strictly one at a time — about 2x faster on measurement, with zero regressions in a validated run. Chunks never span two chapters (chapter *N* always finishes completely before chapter *N+1* starts), preserving paragraph-to-paragraph and chapter-to-chapter drift/consistency.

### Auth UX

- App header now shows the signed-in user's email and a **Sign out** button instead of always showing "Sign In," and updates live on auth state changes.

### Removed

- Dead code: the 12-mode `RevisionMode` type and `src/lib/prompts/revision-modes.ts` had no callers anywhere in the codebase — the live rewrite path has been `src/lib/rewrite/strategies.ts`'s 8 strategies for some time. Removed along with the now-unused `buildRevisionPrompt`.

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
- Added dedicated `GET /api/analytics/freshness` endpoint with pagination (`limit`/`offset`) and drilldown filters (`window`, `routeKey`) for scalable reliability analytics.
- Upgraded freshness analytics endpoint to cursor-based pagination and deeper drilldown filters (`eventName`, `status`) for large result sets.
- Added row-level freshness event drilldown table and active alert feed in analytics telemetry panel.
- Added lightweight reliability SLO cards with thresholds: success rate (>=95%), failure rate (<=5%), forced refresh rate (<=10%).
- Added retention cleanup policy via `cleanup_freshness_events(retention_days int default 90)`.
- Added observability hooks that create alerts for repeated refresh failures and forced-refresh loops.
- Added safety migration to ensure `freshness_events` table exists when local migration history drifts.

### Software Factory Governance

- Added detailed phased execution log at `docs/SOFTWARE_FACTORY.md`.
- Added live engineering backlog at `docs/TODO.md`.

## 0.3.0 - 2026-07-30

### Dialog Density

- New author-selected setting (Low / Normal / Above Normal / High) captured at creation time (idea wizard) and at import time, stored on `books` and `creation_projects`.
- Enforced in every generation/rewrite prompt that produces prose: concept, architecture, chapter drafting, the Rewrite Architect plan, and the per-unit rewrite context packet.
- New eighth **BookForge Critic** lens, **Dialogue Density**: computes real per-chapter dialogue ratios from paragraph text (not just summaries) and scores both target-band alignment and chapter-to-chapter consistency.

### Empirical model-selection feedback loop

- New `model_call_events` table records the outcome of every local LM Studio call: model, task, context length used, outcome (success / empty completion / underlength / context error / generic error), word count, and duration.
- Model scoring (`orchestrator.ts`) now applies a bounded empirical adjustment on top of the existing static name/size/quantization heuristics — a model with a recent recorded incident on a given task is deprioritized; a model with a strong recent success rate is favored.
- Load-time context requests are capped using recorded history: a model that has previously crashed or returned empty output at a given context size gets a smaller, known-safer context on its next load — including when an oversized instance is already loaded (previously reused as-is with no safety check).
- Fixed a model-identity bug where the same physical loaded model could appear as multiple unrelated-looking candidates (e.g. `qwen/qwen3.6-35b-a3b` vs `qwen/qwen3.6-35b-a3b@6bit`), fragmenting both scoring and history tracking. Candidates are now deduplicated to one canonical identity per loaded model.
- Model Status panel gained a "Recent issues" section surfacing any model+task with recorded incidents in the last 14 days.

### Durable jobs and resumability

- Heartbeat-backed durable job handoff added across every long-running AI route: planned draft generation, chapter summaries, manuscript blueprint generation, critic batch runs, rewrite execution, rewrite planning, drift checks, voice capture, and auto-revision.
- Auto-Review Wizard: queued start with a launch handshake, improved error messaging, and a **Resume** flow that detects an interrupted run and continues from the first incomplete stage instead of restarting.
- Persistent AI Jobs panel and job history visibility improvements.

### Fixes

- `pdf-parse` (manuscript PDF import) was crashing at module-load time under Next.js 16's server-component bundling for every import, regardless of file type — added to `serverExternalPackages` alongside the existing `pdfkit` entry.
- Restored missing baseline Postgres grants (`SELECT`/`INSERT`/`UPDATE`/`DELETE` for `anon`/`authenticated`/`service_role`) that a local database reset had dropped, silently breaking every table write.
- Fixed two stale test fixtures: a mock using `.single()` where the real code calls `.maybeSingle()`, and an Auto-Review Wizard test asserting UI copy that had since been renamed.

### Removed

- Course catalog/detail domain and its planning docs (shipped, then withdrawn before this release).

## Unreleased / planned

- Manuscript search — full-text search across all chapters and scenes.
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
