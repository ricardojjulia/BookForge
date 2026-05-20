# BookForge AI

BookForge AI is a local-first manuscript revision studio for authors. It combines a Next.js/Mantine web app, Supabase for auth/database/storage, and LM Studio (or any cloud provider) as the AI engine for analysis, critique, rewriting, and export workflows.

The product goal is not "rewrite this text." BookForge treats a manuscript as a structured book: projects, books, chapters, scenes, paragraphs, revision jobs, revision versions, critic reports, continuity notes, and exports. The author stays in control at every step.

## Current Capabilities

- **Manuscript import** — TXT, Markdown, DOCX, EPUB, and best-effort Kindle KPF/KCB text extraction
- **Structure tools** — chapter/scene/paragraph parsing, structure repair, split/merge, chapter delete
- **Manuscript Blueprint** — AI-generated book bible with characters, themes, style rules, and voice notes
- **BookForge Critic** — seven scored evaluation lenses (story structure, prose quality, continuity, character depth, market fit, theology/worldview, revision priorities) with saved reports
- **Chapter summaries** — health checks and weak-summary regeneration
- **Rewrite Architect** — model fit scoring, coherence contracts, guided workflow, and draft rewrite execution
- **Revision Review** — accept / reject / rerun / batch revision decisions; full rewrite reset
- **Final Manuscript Builder** — Markdown, DOCX, EPUB, and PDF export with assembly source preview
- **Abridged Edition Builder** — shorter version of a manuscript from approved suggestions
- **Creation Wizard** — start a new book from an idea through concept → architecture → chapter draft generation
- **AI provider routing** — LM Studio local models or cloud providers (OpenAI, Anthropic, Google) with execution mode control (auto / local / cloud)
- **FINISHED status** — mark a specific export as the finished version; one-click download from the dashboard

## Roadmap — Features in Active Development

### 1. Manuscript Search

Full-text search across all chapters and scenes. Find any character name, phrase, or passage across the entire book without leaving the studio.

### 2. Author Voice Capture

Analyze 2–3 chapters the author considers their best work to extract a voice fingerprint: sentence length patterns, dialogue rhythm, vocabulary register, and structural preferences. Stored in the Manuscript Blueprint and injected into every humanize and rewrite prompt so "preserve voice" means something specific.

### 3. Character / Location / Theme UI

Full CRUD editor for the five world-building entity types already in the database: characters (with arc notes, relationship map, voice profile), locations, themes, motifs, and timeline notes. Replaces the AI-only book bible with a living reference the author maintains.

### 4. Chapter Snapshots

One-click checkpoint that freezes the current accepted state of a chapter before a major rewrite pass. Named snapshots stored in the database. Restore in one click if the rewrite makes things worse.

### 5. Onboarding Checklist

First-run guided checklist walking new users through the import → blueprint → critic → rewrite → export sequence. Progress tracked per user. Dismissible after completion.

### 6. Beta Reader Mode

Invite a collaborator as a read-only beta reader. They get a clean reading view with the ability to leave inline annotations on paragraphs — no access to the revision studio. The author sees all annotations during the next revision pass.

### 7. Series Bible

Series-level container above individual books. Characters, world-building facts, and unresolved plot threads persist across books. Cross-book continuity critic lens checks book 2 against established facts from book 1.

### 8. Revision Statistics Dashboard

Per-chapter and per-book metrics: word count before/after, AI-suggested vs author-accepted ratio, average paragraph change magnitude, acceptance rate by revision mode. Shows how much of the book is the author's own voice after a rewrite pass.

### 9. Collaboration UI

UI for the existing collaborator role schema (viewer / editor / admin). Invite by email, manage roles, revoke access. Beta reader mode is built on top of the viewer role.

## Why Local AI

BookForge is designed around a clear privacy boundary:

- Supabase stores manuscript data, structure, revision history, settings, reports, and exports
- LM Studio performs AI work through a local OpenAI-compatible endpoint by default
- Cloud providers (OpenAI, Anthropic, Google) can be enabled per task type via the execution mode setting

The default LM Studio endpoint is `http://localhost:1234/v1`.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Mantine 9
- Tailwind CSS 4
- Supabase Auth, Postgres, Storage, and RLS
- LM Studio local OpenAI-compatible server
- OpenAI TypeScript SDK (pointed at LM Studio or cloud providers)
- DOCX, EPUB, PDF, Markdown, and archive parsing/export helpers

## Quick Start

```bash
npm install
supabase start
supabase migration up
cp .env.example .env.local   # fill values from supabase status
npm run dev
```

Open `http://localhost:3000`. Start LM Studio, enable the local server, and load at least one instruct model.

## Environment

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Optional — defaults shown
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_API_KEY=lm-studio
```

Do not commit `.env.local`.

## AI Provider Configuration

Open Settings to configure:

- **LM Studio** (default) — local model endpoint, model slots by task (primary rewrite, reasoning, extraction, embedding, reranker), quality profile, context window, temperature
- **Cloud providers** — OpenAI, Anthropic, or Google; API key, model name, temperature, max output tokens
- **Execution mode** — Auto (cloud for critic/planning, local for rewrite/extraction), Local only, Cloud only

## Main Workflows

### Revise an existing manuscript

1. Import a manuscript (TXT, MD, DOCX, EPUB)
2. Review and repair chapter/scene structure
3. Generate chapter summaries and Manuscript Blueprint
4. Run BookForge Critic (all seven lenses)
5. Generate a Rewrite Architect plan
6. Run guided rewrite batches
7. Review and accept/reject revisions
8. Run drift check and post-rewrite critic
9. Export from Final Manuscript Builder
10. Mark the finished export as the book's final version

### Create a book from an idea

1. Open Create a Book From an Idea from the dashboard
2. Enter title, genre, audience, language, target pages, tone, and worldview boundaries
3. Run the concept pass — review and accept the premise
4. Run the architecture pass — review and accept chapter structure
5. Generate chapter drafts one by one

## Guardrails

- Original manuscript text is never overwritten
- Revision history is append-only through `revision_jobs` and `revision_versions`
- Accepted revisions are stored separately from original text
- Large workflows use preflight, model fit scoring, batch sizing, and progress tracking
- Locked passages are always respected
- Model prompts include global book context, nearby summaries, character permanence, timeline state, motifs, author instructions, and drift-prevention rules

## Project Structure

```text
src/app/          Next.js routes and API handlers
src/components/   Mantine UI components and workflow panels
src/lib/          Supabase, LM Studio, prompts, parsing, revision, export logic
supabase/         Database migrations
```

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## License

MIT. See [LICENSE](LICENSE).
