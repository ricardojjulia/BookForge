# Book Copilot Chat Blueprint

Last updated: 2026-07-27
Owner: Product + Engineering
Target release line: v0.3.x

## 1) Objective

Add an always-open, collaborative chat workspace on each book page that can:

- Answer with strong long-context awareness.
- Update book information safely.
- Trigger internal BookForge workflows (critic, rewrite, summaries, export).
- Run single-model or multi-model council responses with optional judge synthesis.

This blueprint is mapped to the current stack and route patterns already used in BookForge.

## 2) Why This Fits The Current System

BookForge already has the critical foundations:

- Execution routing modes and provider settings in src/components/settings/settings-form.tsx and src/lib/lmstudio/settings.ts.
- Active provider orchestration in src/lib/lmstudio/orchestrator.ts.
- Durable queue and worker patterns across long-running workflows (documented in docs/STATUS.md).
- Existing editable book input surfaces in src/components/books/inputs/book-inputs-manager.tsx.

The main gap is a single conversational control surface that orchestrates these abilities consistently.

## 3) Product Scope

### In scope for MVP

- Per-book persistent chat thread.
- Tool-calling chat that can:
  - Read and summarize book context.
  - Propose updates to book inputs.
  - Trigger existing workflow routes with job tracking.
- Explicit apply/approve UX for any manuscript mutation.
- Basic long-context retrieval (chapter/scene/paragraph chunks + key reports).

### Out of scope for MVP

- Fully autonomous unsupervised editing loops.
- Cross-book global memory graph.
- Real-time collaborative cursors.

## 4) Data Model Additions

Add the following tables via Supabase migrations.

### 4.1 chat_threads

Purpose: one or more persistent conversations per book.

Columns:

- id uuid primary key
- book_id uuid not null references books(id) on delete cascade
- created_by uuid not null references auth.users(id)
- title text null
- mode text not null check mode in (ask, edit, run, council)
- context_policy jsonb not null default {}
- pinned_context jsonb not null default {}
- is_archived boolean not null default false
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

Indexes:

- index on (book_id, updated_at desc)
- index on (created_by, updated_at desc)

### 4.2 chat_messages

Purpose: immutable turn log and streaming status.

Columns:

- id uuid primary key
- thread_id uuid not null references chat_threads(id) on delete cascade
- book_id uuid not null references books(id) on delete cascade
- role text not null check role in (user, assistant, system, tool)
- content text not null
- content_json jsonb not null default {}
- status text not null check status in (draft, streaming, completed, failed)
- token_usage jsonb not null default {}
- model_info jsonb not null default {}
- parent_message_id uuid null references chat_messages(id)
- created_by uuid null references auth.users(id)
- created_at timestamptz not null default now()

Indexes:

- index on (thread_id, created_at)
- index on (book_id, created_at desc)

### 4.3 chat_tool_calls

Purpose: record all workflow/tool invocations from chat.

Columns:

- id uuid primary key
- thread_id uuid not null references chat_threads(id) on delete cascade
- message_id uuid not null references chat_messages(id) on delete cascade
- tool_name text not null
- tool_args jsonb not null default {}
- tool_result jsonb not null default {}
- job_id uuid null references revision_jobs(id)
- status text not null check status in (queued, running, completed, failed, cancelled)
- error_message text null
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

Indexes:

- index on (thread_id, created_at)
- index on (job_id)

### 4.4 chat_context_snapshots

Purpose: deterministic context packages used to answer a turn.

Columns:

- id uuid primary key
- thread_id uuid not null references chat_threads(id) on delete cascade
- message_id uuid not null references chat_messages(id) on delete cascade
- retrieval_manifest jsonb not null default {}
- token_budget jsonb not null default {}
- source_hash text not null
- created_at timestamptz not null default now()

Indexes:

- index on (thread_id, created_at desc)
- unique index on (message_id)

### 4.5 chat_model_votes

Purpose: multi-model council candidate outputs and scores.

Columns:

- id uuid primary key
- thread_id uuid not null references chat_threads(id) on delete cascade
- message_id uuid not null references chat_messages(id) on delete cascade
- provider text not null
- model text not null
- candidate_text text not null
- candidate_json jsonb not null default {}
- scorecard jsonb not null default {}
- created_at timestamptz not null default now()

Indexes:

- index on (message_id, created_at)

### 4.6 chat_syntheses

Purpose: judge/synthesizer output persisted for traceability.

Columns:

- id uuid primary key
- thread_id uuid not null references chat_threads(id) on delete cascade
- message_id uuid not null references chat_messages(id) on delete cascade
- judge_provider text not null
- judge_model text not null
- rubric jsonb not null default {}
- winning_vote_ids uuid[] not null default '{}'
- synthesis_text text not null
- synthesis_json jsonb not null default {}
- created_at timestamptz not null default now()

Indexes:

- index on (message_id)

## 5) RLS Policy Strategy

Match existing owner/collaborator model.

- Select chat rows if user can view the parent book.
- Insert user messages only if user can edit the parent book.
- Insert assistant/tool rows only via service-role route handlers.
- Update only status fields where needed by workers (service role).
- Never allow direct client-side deletion of message history.

## 6) API Contracts

### 6.1 POST /api/books/[bookId]/chat/threads

Creates a new thread.

Request fields:

- title optional
- mode one of ask, edit, run, council
- contextPolicy optional object

Response fields:

- thread object

### 6.2 GET /api/books/[bookId]/chat/threads

Lists threads for current user and book.

Response fields:

- threads[] with id, title, mode, updatedAt, lastMessagePreview

### 6.3 GET /api/books/[bookId]/chat/threads/[threadId]

Loads thread metadata and paginated messages.

Query params:

- cursor optional
- limit default 50

### 6.4 POST /api/books/[bookId]/chat/threads/[threadId]/messages

Primary chat endpoint. Handles assistant reply generation.

Request fields:

- userMessage string
- mode ask | edit | run | council
- scope optional: whole_book | chapter | scene | selection
- scopeIds optional array
- useTools boolean
- council optional object:
  - enabled boolean
  - generators array of provider/model
  - judge provider/model
  - rubric profile id

Response fields:

- assistantMessage
- toolCalls[]
- snapshotId
- councilSummary optional

### 6.5 POST /api/books/[bookId]/chat/threads/[threadId]/apply

Applies an approved mutation proposal.

Request fields:

- messageId
- proposalId
- applyMode create_revision | update_metadata | create_plan

Response fields:

- applied true
- createdEntity references (revisionVersionId, reportId, etc.)

### 6.6 POST /api/books/[bookId]/chat/threads/[threadId]/tool-run

Explicit tool execution endpoint for run mode.

Request fields:

- toolName
- toolArgs
- idempotencyKey

Response fields:

- toolCall record
- linkedJobId optional

## 7) Server Orchestration Design

Create a dedicated orchestration module in src/lib/chat/orchestrator.ts that:

1. Builds context snapshot.
2. Selects route: direct answer, tool call, or council.
3. Persists message + tool traces + vote/synthesis artifacts.
4. Returns deterministic response payload.

### 7.1 Context assembly pipeline

Inputs per turn:

- Active thread summary.
- Recent accepted revisions.
- Book bible and chapter summaries.
- Relevant critic/rewrite reports.
- Retrieval chunks from manuscript by semantic + structural filters.

Compression strategy:

- Keep rolling thread summary updated every N turns.
- Include chapter-level compressed state, not full raw text, unless explicitly requested.
- For whole-book tasks, use map-reduce execution over chapters and then synthesis.

### 7.2 Tool routing rules

- ask mode: prefer direct response, no mutations.
- edit mode: produce structured proposals first, require apply confirmation.
- run mode: prefer internal tool/workflow calls and return job tracking.
- council mode: fan-out generation + judge synthesis with token/cost cap.

## 8) Council Mode Specification

Council request object:

- generators: 1..N models selected by user
- judge: single model
- rubric: coherence, voice fidelity, theological alignment, continuity safety, readability, originality

Execution order:

1. Generate candidates independently.
2. Normalize candidates into comparable schema.
3. Judge scores all candidates against rubric.
4. Synthesizer emits final recommendation with citation of winning candidates.

Guardrails:

- Max generator count default 3 (hard cap 5).
- Hard timeout budget per turn.
- If judge fails, return ranked raw candidates with explicit warning.

## 9) UI Slice (First Deliverable)

Add a persistent chat rail to the book workspace.

### 9.1 New UI components

- src/components/books/chat/book-chat-rail.tsx
- src/components/books/chat/chat-thread-list.tsx
- src/components/books/chat/chat-message-list.tsx
- src/components/books/chat/chat-composer.tsx
- src/components/books/chat/chat-tool-result-card.tsx
- src/components/books/chat/chat-council-card.tsx

### 9.2 Initial integration point

- Mount rail on book detail workspace page near existing workflow panels.
- Keep current panels intact; chat is additive.

### 9.3 UX contract

- Mode switcher: Ask, Edit, Run, Council.
- Scope chips: Whole book, Chapter, Scene, Selection.
- Mutation proposals shown as diff-style cards with Apply button.
- Tool-run jobs show live status and deep links to existing jobs history page.

## 10) Incremental Delivery Plan

### Milestone A: Foundation (1 sprint)

- Migrations + RLS for chat tables.
- Thread create/list/load APIs.
- Basic rail UI with user and assistant messages.
- Single-model assistant in ask mode.

Acceptance:

- User can hold persistent per-book conversation across sessions.

### Milestone B: Tooling (1 sprint)

- Tool-call API and trace persistence.
- Connect run mode to existing workflow routes.
- Add status cards for queued/running/completed jobs.

Acceptance:

- User can trigger at least three existing workflows from chat and observe status.

### Milestone C: Safe editing (1 sprint)

- Edit mode proposal schema.
- Apply endpoint and write-path integration.
- Revision-safe apply flow.

Acceptance:

- No direct manuscript mutation without explicit user approval.

### Milestone D: Council mode (1 sprint)

- Multi-generator fan-out.
- Judge and synthesis persistence.
- Council scorecard UI.

Acceptance:

- User can select multiple models and receive judged synthesis.

## 11) Observability

Emit new telemetry events:

- chat_turn_started
- chat_turn_completed
- chat_turn_failed
- chat_tool_call_started
- chat_tool_call_completed
- chat_tool_call_failed
- chat_council_started
- chat_council_completed

Track per turn:

- latency
- token usage
- estimated cost
- apply rate
- rollback/reject rate

## 12) Testing Strategy

- Unit tests:
  - context budget allocator
  - tool router decision logic
  - council ranking parser and fallback paths
- Route tests:
  - thread CRUD auth/RLS behavior
  - proposal apply safety checks
  - tool-call idempotency
- Component tests:
  - mode switching
  - proposal apply UX
  - council result rendering

## 13) Risks And Mitigations

- Cost spikes from council mode: enforce caps and default to single model.
- Context drift: snapshot and summarize thread state every N turns.
- Hidden mutations: enforce proposal then apply confirmation gate.
- Latency: split long operations into async tool runs with job cards.

## 14) Immediate Implementation Checklist

1. Add migration files for chat schema and RLS.
2. Scaffold API routes under src/app/api/books/[bookId]/chat/.
3. Build minimal chat rail UI with ask mode only.
4. Add context snapshot service in src/lib/chat/.
5. Wire run mode to one existing workflow route as pilot.
6. Add telemetry and first dashboard counters.

## 15) Mapping To Existing Files

This blueprint is designed to plug into existing patterns in:

- docs/ARCHITECTURE.md
- docs/STATUS.md
- src/lib/lmstudio/orchestrator.ts
- src/lib/lmstudio/settings.ts
- src/components/settings/settings-form.tsx
- src/components/books/inputs/book-inputs-manager.tsx
- src/app/api/books/[bookId]/rewrite-execute/route.ts

