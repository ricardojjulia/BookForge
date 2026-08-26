# BookForge Architecture

Last updated: 2026-08-26

## 1. Product Purpose

BookForge is a local-first manuscript platform that takes an author from idea to finished publication package.

Primary domain today:

- Projects
- Books
- Chapters/scenes/paragraphs
- Critic and rewrite workflows
- Exports and finished-book publishing

## 2. System Overview

```mermaid
flowchart LR
  UI[Next.js App Router UI] --> API[Route Handlers / Server Components]
  API --> DB[(Supabase Postgres)]
  API --> Storage[(Supabase Storage)]
  API --> AI[AI Orchestrator]
  AI --> LM[LM Studio Local]
  AI --> Cloud[OpenAI / Anthropic / Google / OpenRouter]
```

Core principles:

- Original manuscript text is immutable.
- AI outputs are append-only via revision history.
- Author/admin remains in control of acceptance and export.
- Local AI is default, cloud AI is opt-in.

## 3. Runtime Layers

### 3.1 Frontend

- Next.js App Router pages and server components.
- Mantine component system.
- Client actions call internal API routes.

### 3.2 Backend in App

- Route handlers in `src/app/api/**`.
- Domain logic in `src/lib/**`.
- Supabase server client for authenticated data access.

### 3.3 Data

- Supabase Postgres for book domain entities.
- Supabase Storage for generated exports and binary artifacts.
- RLS policies enforce owner/collaborator boundaries.

### 3.4 AI Execution

- LM Studio orchestration and task-fit model selection.
- Cloud provider routing by execution mode (`auto`, `local`, `cloud`) across four providers: OpenAI, Anthropic, Google, and OpenRouter — all normalized to the OpenAI SDK's `chat.completions.create` shape (`src/lib/ai/providers.ts`).
- Per-task model overrides (`StandardLlmSettings.taskModels`) let a cloud-configured user assign a different model to critic, rewrite, planning, and extraction calls independently, resolved per call by `selectAndPrepareActiveModel` (`src/lib/lmstudio/orchestrator.ts`) — most useful with OpenRouter, where cost/speed varies widely by model (`docs/internal/openrouter-integration-plan.md`).
- Critic/rewrite/planning operations persist reports and job traces.

#### Long-running job lifecycle

Full-book rewrite execution and draft generation don't run to completion in one request — a full pass can take well over an hour of real model calls, comfortably past any serverless function's timeout. Instead, each request processes **one bounded chunk** (never crossing a chapter boundary) and then re-dispatches itself:

```mermaid
sequenceDiagram
    participant Route as rewrite-execute route
    participant DB as revision_jobs (Postgres)
    participant LLM as OpenRouter / LM Studio

    Route->>DB: status: running (or resumed)
    loop Per chapter, in order
        loop Chunk of up to 5 paragraphs (never crosses a chapter boundary)
            Route->>LLM: rewrite call (up to 3 attempts if empty completion)
            LLM-->>Route: revised paragraph or empty
            Route->>DB: insert revision_versions row, update progress + heartbeat
        end
        Note over Route: after() self-chains another request<br/>with the same jobId to continue
    end
    Route->>DB: status: completed, failedUnits: [...]
```

`after()` isn't provably 100% reliable — observed live, a job can self-chain cleanly several times and then a continuation silently never fires, leaving the job "running" with a frozen heartbeat. Rather than trust a single mechanism, two independent backstops resume any job whose heartbeat has gone stale (currently 45s):

- **Per-book backstop** (`resumeStaleChunkedJobs`, `src/lib/ai/resume-stale-chunked-jobs.ts`) — runs opportunistically using the current authenticated page request's own cookie, whenever a user loads that book's Studio page.
- **Platform-wide cron backstop** (`/api/internal/resume-stale-chunked-jobs`) — catches the same condition even when nobody is looking at the app at all.

Both backstops share a resume-attempt ceiling (`MAX_RESUME_ATTEMPTS`) — a job that still can't get past one more chunk after 10 real resume attempts gets marked genuinely failed with a clear reason, rather than retried forever.

Key properties this depends on:

- Paragraphs within a chunk run concurrently (bounded, currently 5 at a time); chapter *N* always finishes completely before chapter *N+1* starts, preserving paragraph-to-paragraph and chapter-to-chapter drift/consistency.
- A paragraph that gets an empty completion is retried up to 3 times before being recorded as a real failure in the job's `failedUnits` list (not silently kept as the original text under a misleading "rewritten" label).
- `retryJobId` re-processes exactly the paragraphs listed in a previous job's `failedUnits`, so a partial failure doesn't require rerunning the whole batch.
- Client-side polling of the job row is how the UI observes progress — the server-side chunking/resume machinery above runs independently of whether any browser tab is open.

## 4. Domain Model (Current)

Primary entities:

- `projects`, `books`
- `chapters`, `scenes`, `paragraphs`
- `book_bibles`, `coherence_reports`
- `revision_jobs`, `revision_versions`, `rewrite_workflows`
- `exports`, `book_matter_sections`
- `series`, `series_notes` (series-level continuity)

Publishing extension:

- `publishing_lab_bundle` reports in `coherence_reports` for post-finish ultimate critic + assets + cover variants.

## 5. Primary Workflows

### 5.1 Existing Manuscript
1. Import/paste manuscript.
2. Structure audit/repair.
3. Summaries + Manuscript Blueprint.
4. Critic lenses.
5. Rewrite planning and execution.
6. Revision accept/reject.
7. Drift + post-rewrite critic.
8. Export and mark finished.
9. Optional Publishing Lab for post-finish packaging and assets.

### 5.2 Create From Idea
1. Concept pass.
2. Architecture pass.
3. Planned chapter draft generation.
4. Auto-Review wizard.
5. Export + finished state.
6. Optional Publishing Lab.

## 6. Data Freshness and Refresh Policy

Problem addressed:

- Always-live fetching can increase API fragility and create avoidable user-facing errors.

Policy:

- Fresh threshold: `< 24h`
- Stale threshold: `>= 24h and < 48h` (show prompt to refresh)
- Expired threshold: `>= 48h` (attempt forced refresh once per stale window)

UX contract:

- Always show freshness status (`Data fetched X ago`).
- Manual refresh is always available.
- If refresh fails, keep stale snapshot visible and show warning + retry.

Implementation components:

- Shared freshness policy helper in `src/lib/freshness/policy.ts`.
- Reusable banner in `src/components/layout/data-freshness-banner.tsx`.
- Route-level integration on dashboard and key workflow pages.

## 7. Reliability and Tooling

Operational events instrumented:

- `freshness_refresh_attempt`
- `freshness_refresh_success`
- `freshness_refresh_failed`
- `freshness_forced_refresh_triggered`

Telemetry sink:

- `POST /api/telemetry/freshness` (server-side operational logging).

Quality gates:

- Unit tests for freshness threshold math (`src/lib/freshness/policy.test.ts`).
- UI tests for stale/expired rendering and fallback behavior (`src/components/layout/data-freshness-banner.test.tsx`).
- PR checklist item: avoid unnecessary route-wide `force-dynamic` usage.

## 8. Security and Access

- Supabase Auth for identity.
- RLS policies for owner and collaborator permissions — including collaborator invite acceptance, which requires narrowly-scoped self-service policies rather than the usual admin/editor gates, since an invitee by definition doesn't have book access yet.
- Cross-table RLS checks are implemented as `security definer` Postgres functions (`can_admin_book`, `can_edit_book`, `has_book_role`), not inline subqueries — the established, working pattern for anything that needs to check permissions against a different table than the one the policy is defined on.
- A platform-wide **Steward** role (`profiles.platform_role`), separate from book ownership/collaboration, gates support-only operations (account deletion/restore, ownership transfer) without a service-role-bypass "admin god-mode" account.
- Secrets that need to be readable by trusted server-side code but never by a regular authenticated session (LLM API keys users paste in, HMAC keys for internal hashing) are stored in Supabase Vault, accessed only through `security definer` functions — never a plaintext column.
- Sensitive operations scoped to book ownership.
- Cloud provider usage is explicit and configurable by user settings.

## 9. Technical Debt Watchlist

- Reduce broad dynamic rendering where not required.
- Expand automated tests across parsing, rewrite planning, and export assembly — `rewrite-execute`'s bounded-concurrency and empty-completion-retry logic specifically has no automated test coverage yet, only manual load-testing.
- Rewrite-execute concurrency is currently fixed at 5 paragraphs/chunk, validated against one OpenRouter model (`deepseek/deepseek-v4-pro`) with zero observed rate-limiting. Headroom beyond 5, and behavior with other providers/models, hasn't been tested.
