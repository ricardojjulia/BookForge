# BookForge AI

BookForge AI is a local-first manuscript revision studio for authors. It combines a Next.js/Mantine web app, Supabase for auth/database/storage, and LM Studio as the local AI engine for analysis, critique, rewriting, and export workflows.

The product goal is not "rewrite this text." BookForge treats a manuscript as a structured book: projects, books, chapters, scenes, paragraphs, revision jobs, revision versions, critic reports, continuity notes, and exports.

## Current Snapshot

This repository is a serious MVP in active development. The core local workflow is running:

- Supabase auth, local database migrations, RLS policies, and storage buckets.
- Dashboard, book dashboard, settings, manuscript import, and book creation entry points.
- Manuscript import for TXT, Markdown, DOCX, EPUB, and best-effort Kindle KPF/KCB text extraction.
- Chapter, scene, and paragraph parsing with repair tools for repeated or broken structure.
- Manuscript Blueprint, formerly called Book Bible, for book-level context and style rules.
- BookForge Critic with scored evaluation lenses and saved reports.
- Chapter summaries with health checks and weak-summary regeneration.
- Rewrite Architect for model fit, structured plans, coherence contracts, guided rewrite runs, and draft rewrite execution.
- Revision Review for accepting, rejecting, rerunning, and resetting draft rewrite versions.
- Final Manuscript Builder for Markdown, DOCX, EPUB, and PDF exports.
- Abridged Edition Builder for shorter versions of a manuscript.
- Creation Wizard for starting a new book from an idea through concept and architecture approval.

See [ROADMAP.md](ROADMAP.md) for what is done, active, and next.

## Why Local AI

BookForge is designed around this privacy boundary:

- Supabase stores manuscript data, structure, revision history, settings, reports, and exports.
- LM Studio performs AI work through a local OpenAI-compatible endpoint.
- Public AI APIs are not used unless a future explicit opt-in setting is added.

The default LM Studio endpoint is:

```text
http://localhost:1234/v1
```

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Mantine 9
- Tailwind CSS 4
- Supabase Auth, Postgres, Storage, and RLS
- LM Studio local OpenAI-compatible server
- OpenAI TypeScript SDK pointed at LM Studio
- DOCX, EPUB, PDF, Markdown, and archive parsing/export helpers

## Quick Start

Install dependencies:

```bash
npm install
```

Start Supabase locally and apply migrations:

```bash
supabase start
supabase migration up
```

Create `.env.local` from `.env.example` and fill the Supabase values from `supabase status`:

```bash
cp .env.example .env.local
```

Start LM Studio, enable the local server, and load at least one chat/instruct model.

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment

Required:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Optional:

```bash
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_API_KEY=lm-studio
```

Do not commit `.env.local`. It is intentionally ignored.

## Main Workflows

**Import and revise an existing manuscript**

1. Create or sign in to an account.
2. Import a manuscript or paste text.
3. Review detected chapters and repair structure if needed.
4. Generate summaries and a Manuscript Blueprint.
5. Run BookForge Critic.
6. Generate a Rewrite Architect plan.
7. Run a guided sample rewrite batch.
8. Review draft revisions.
9. Continue full spread batches after the voice feels right.
10. Run Critic and drift checks again.
11. Export accepted revisions.

**Create a book from an idea**

1. Open `Create a Book From an Idea` from the dashboard.
2. Enter title, genre, audience, language, page target, worldview boundaries, and author notes.
3. Run the concept pass.
4. Accept or revise the generated concept.
5. Run the architecture pass.
6. Accept the architecture to create a real BookForge project/book with planned chapters.

The next implementation step is chapter-by-chapter prose generation from that approved architecture.

## Guardrails

- Original manuscript text is never overwritten.
- Revision history is append-first through `revision_jobs` and `revision_versions`.
- Accepted revisions are stored separately from original text.
- Large workflows use preflight, model fit, batch sizing, and progress tracking.
- Locked passages are respected.
- Continuity and coherence are treated as first-class requirements.
- Model prompts include global book context, nearby summaries, character permanence, timeline state, motifs, author instructions, and drift-prevention rules.

## Local Model Strategy

BookForge does not hardcode model names. The settings screen lets the user assign models by task:

- primary rewrite model
- reasoning model
- extraction model
- embedding model
- reranker model
- quality profile
- context window
- temperature
- top-p
- repeat penalty
- max output tokens

The model evaluator scores available LM Studio models for rewrite suitability and warns when none appear strong enough for the requested job.

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Project Structure

```text
src/app/          Next.js routes and API handlers
src/components/   Mantine UI components and workflow panels
src/lib/          Supabase, LM Studio, prompts, parsing, revision, export logic
supabase/         Database migrations
prompts/          Prompt templates and prompt documentation
docs/             Product and workflow documentation
```

## Documentation

- [HOWTO.md](HOWTO.md): local setup and common workflows.
- [ROADMAP.md](ROADMAP.md): completed work and next implementation phases.
- [CHANGELOG.md](CHANGELOG.md): project history.
- [docs/STATUS.md](docs/STATUS.md): short project status brief.
- [docs/book-creation-wizard-plan.md](docs/book-creation-wizard-plan.md): detailed creation wizard plan.

## License

MIT. See [LICENSE](LICENSE).
