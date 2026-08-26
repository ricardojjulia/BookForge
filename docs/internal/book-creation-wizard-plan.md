# BookForge Creation Wizard Plan

## Product Goal

Add an optional author-dashboard workflow that can create a new book draft from an idea or prompt, up to roughly 150 pages, while keeping the author in control at every stage.

This is not a one-shot "write a book" feature. It should use the same safety philosophy as revision:

- plan first
- ask for approval
- generate in structured units
- preserve prompt/version history
- parse the created manuscript into chapters/scenes/paragraphs
- run BookForge Critic after creation

## Entry Point

Dashboard card:

- Title: `Create a Book From an Idea`
- Supporting text: `Build a structured first draft from a prompt, then evaluate it with BookForge Critic.`
- Primary button: `Start Creation Wizard`
- Secondary note: `Veteran users can still import a manuscript directly.`

## Workflow

### 1. Idea Intake

User provides:

- working title
- core idea or prompt
- genre
- target audience
- desired length, capped at 150 pages
- language
- tone
- worldview/theological boundaries, optional
- forbidden content/changes
- comparable books, optional
- author notes

Output:

- saved `creation_project`
- no manuscript text generated yet

### 2. Concept Pass

LM Studio generates:

- main theme
- reader promise
- premise
- emotional engine
- genre fit
- target audience fit
- major risks

User can:

- accept
- edit manually
- regenerate

### 3. Architecture Pass

LM Studio proposes:

- book structure
- acts/parts
- chapters
- estimated page/word budget per chapter
- chapter purpose
- core conflict or teaching point per chapter

User can:

- reorder chapters
- rename chapters
- merge/split chapters
- lock required chapters

### 4. Character / Voice / World Pass

For fiction or narrative nonfiction:

- characters
- character arcs
- relationships
- secrets
- do-not-change rules

For nonfiction/devotional/self-help:

- reader persona
- author voice rules
- recurring teaching motifs
- examples/anecdote placeholders
- theological/philosophical alignment

### 5. Prompt Approval

Before generation, show:

- book objective
- structure
- chapter list
- character/theme notes
- tone rules
- continuity contract
- generation limits
- model fit warning
- expected AI calls

User clicks:

- `Approve Generation Plan`
- or `Revise Plan`

### 6. Draft Generation

Generate in small units:

- chapter by chapter
- scene by scene
- paragraph clusters for long chapters

Rules:

- never generate the whole book in one prompt
- keep a rolling continuity ledger
- save every generated unit
- preserve prompt snapshots
- allow pause/resume/cancel
- show AI job progress

### 7. Parse Into BookForge Structure

After generation:

- create `books`
- create `chapters`
- create `scenes`
- create `paragraphs`
- store generated first draft separately from imported originals
- mark provenance as `ai_created_first_draft`

### 8. Immediate Evaluation

Run:

- BookForge Critic baseline
- Manuscript Blueprint generation
- chapter summaries
- continuity review

Then route user into:

- Rewrite Architect
- Revision Review
- Final Manuscript Builder

## Data Model Sketch

Future tables:

- `creation_projects`
- `creation_plan_versions`
- `creation_prompt_versions`
- `creation_units`
- `creation_jobs`

Important fields:

- `owner_id`
- `status`
- `idea_prompt`
- `approved_plan`
- `target_page_count`
- `target_word_count`
- `quality_profile`
- `model_assignments`
- `continuity_ledger`
- `created_book_id`

## MVP Scope

Build first:

1. Dashboard entry card.
2. Creation wizard shell.
3. Idea intake form.
4. Concept pass with LM Studio.
5. Editable generated plan.
6. Approval gate.

Then:

7. Chapter-by-chapter generation.
8. Parse generated draft into BookForge tables.
9. Auto-run Critic and Blueprint.

## Guardrails

- Do not claim generated work is polished/final.
- Do not bypass author approval.
- Do not generate more than the approved target.
- Keep all generated units versioned.
- Keep reference/style samples as guidance only.
- Use local LM Studio model only.
- Warn if the configured model is weak for long-form generation.
