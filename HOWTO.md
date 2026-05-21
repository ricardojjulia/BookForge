# BookForge AI HOWTO

This guide covers the local development and author workflows for BookForge AI.

## 1. Local Development Setup

Install dependencies:

```bash
npm install
```

Start Supabase:

```bash
supabase start
```

Apply migrations:

```bash
supabase migration up
```

Create local environment variables:

```bash
cp .env.example .env.local
```

Then fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

You can get those values from:

```bash
supabase status
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 2. Default Account (Seed User)

After running migrations, seed the database to create a ready-to-use local account:

```bash
supabase db reset
```

Or apply the seed manually against a running instance:

```bash
supabase db seed
```

Default credentials:

```text
Email:    demo@bookforge.local
Password: bookforge123
```

Change the password after first sign-in from **Account** in the top nav.

## 3. LM Studio Setup

1. Open LM Studio.
2. Download or load an instruct/chat model.
3. Start the local server.
4. Confirm the server is available at `http://localhost:1234/v1`.
5. In BookForge, open Settings.
6. Test the LM Studio connection.
7. Assign models for rewrite, reasoning, extraction, and embeddings.

BookForge can evaluate available models and warn when the current model is weak for a full-book rewrite.

## 3. Import A Manuscript

Supported MVP inputs:

- DOCX
- EPUB
- Kindle KPF/KCB, best-effort text extraction
- Markdown
- TXT
- pasted manuscript text
- manual chapter creation

Recommended flow:

1. Go to Dashboard.
2. Create/import a book.
3. Upload or paste the manuscript.
4. Review detected chapters.
5. Use Structure Audit when chapters look wrong.
6. Split, merge, rename, or repair chapters before heavy AI work.

Original manuscript text is preserved. Parsed chapters, scenes, and paragraphs are stored separately.

## 4. Prepare A Book For Rewrite

Before rewriting, run:

1. Chapter summaries.
2. Manuscript Blueprint.
3. BookForge Critic.
4. Rewrite Architect plan.
5. Model evaluation.

The guided rewrite workflow will warn when required pieces are missing.

## 5. Run A Guided Rewrite

Recommended first run:

1. Open Rewrite Architect.
2. Use Guided Rewrite Run.
3. Generate or review the plan.
4. Evaluate models.
5. Start with a small sample batch.
6. Review the draft revision versions.
7. Accept, reject, or reset the direction.
8. Continue with full spread batches.

BookForge saves rewrite output as revision versions. It does not replace original manuscript text.

## 6. Review Draft Revisions

Open Review Draft Revisions from the book dashboard or rewrite workflow.

You can:

- accept individual draft revisions
- reject individual draft revisions
- rerun selected paragraphs
- accept batches
- reset all rewrite suggestions and approvals

Accepted revisions become candidates for the final manuscript. Rejected versions remain in history.

## 7. Export A Final Manuscript

Open Final Manuscript Builder.

Choose whether to use:

- accepted revisions only
- latest revisions
- original text for locked passages

Export formats:

- Markdown
- DOCX
- EPUB
- PDF

Exports are saved through Supabase storage/export records.

## 8. Create A Book From An Idea

The Creation Wizard is available from the dashboard.

Steps:

1. Enter a working title and idea.
2. Select genre, audience, language, tone, and target page count.
3. Add worldview boundaries, forbidden content, comparable books, and author notes.
4. Run Concept Pass — review the premise, emotional engine, and reader promise.
5. Accept or revise the concept.
6. Run Architecture Pass — review the part/chapter structure, key beats, and word targets.
7. Accept Architecture to create a BookForge book with planned chapter shells.
8. On the book page, the **Architecture Roadmap** panel shows every chapter and its draft status.
9. In Studio Actions, click **Generate Planned Draft** to generate up to 5 chapters at a time. Repeat until all chapters show "draft" status.
10. When all chapters are drafted, click **Auto-Review Wizard** and choose "Do it all for me!" — it runs the full review, rewrite, and export cycle autonomously.

Target pages drives chapter count. 50 pages → ~3 chapters; 200 pages → ~12–15 chapters. If the result feels too short, delete the book and restart with a higher page target.

## 9. Troubleshooting

### Supabase environment is not configured

Check `.env.local` and restart the dev server.

### LM Studio says model unloaded

Open LM Studio, load the selected model, then test the connection from Settings.

### Chapters look duplicated or wrong

Use Structure Audit before summaries or rewrite. Repair titles, merge title-only chapters, or split chapters from the repair tools.

### Rewrite count looks smaller than the whole book

Draft rewrite batch size means how many units to process in this run. BookForge intentionally favors smaller batches so the author can review direction before continuing.

### A model returns malformed JSON

BookForge attempts JSON repair, but local models can still fail. Retry with a stronger reasoning/extraction model or reduce the batch/context size.

### Need a clean rewrite direction

Use Reset Rewrite Work to remove previous rewrite suggestions and approvals while preserving original manuscript text.

### Auto-Review failed mid-run (laptop slept, network dropped)

Click Auto-Review Wizard again. An orange "Resume" banner will appear showing how many stages completed. Click Resume — completed stages are skipped and the run picks up where it stopped.

### Generated chapters are very short (a few paragraphs only)

The model may have ignored the word-count instruction. Check that the architecture has `targetWords` or `targetPages` set per chapter. Running against a cloud model (Anthropic or OpenAI) via cloud execution mode produces more reliable lengths than a small local model.

### Book has fewer chapters than expected after creation

Chapter count is proportional to target pages. A 50-page target produces 3–4 chapters; aim for 200+ pages for a full novel structure.
