# How-To Guide

Practical walkthroughs for the scenarios you'll actually run into. If you haven't
set the app up yet, do the [Quick Start](../README.md#quick-start) in the README
first — this guide assumes it's already running at `http://localhost:4747` with
LM Studio (or a cloud provider) configured.

## Contents

1. [Revise an existing manuscript](#1-revise-an-existing-manuscript)
2. [Create a book from an idea](#2-create-a-book-from-an-idea)
3. [Tune dialogue density](#3-tune-dialogue-density)
4. [Let Auto-Review run the whole loop](#4-let-auto-review-run-the-whole-loop)
5. [Resume an interrupted Auto-Review run](#5-resume-an-interrupted-auto-review-run)
6. [Choose between LM Studio and a cloud provider](#6-choose-between-lm-studio-and-a-cloud-provider)
7. [Read the Model Status panel when something misbehaves](#7-read-the-model-status-panel-when-something-misbehaves)
8. [Export and mark a version finished](#8-export-and-mark-a-version-finished)

---

## 1. Revise an existing manuscript

You have a manuscript already — a DOCX from a previous draft, an EPUB export, a
pasted block of text — and you want BookForge to help you strengthen it.

1. **Dashboard → Import.** Drop the file (TXT, Markdown, DOCX, EPUB, or
   best-effort KPF/KCB from Kindle Create) or paste text directly. Fill in
   genre, target audience, point of view, tense, and a dialogue-density target
   if you already know it — you can leave these as defaults and revisit later.
2. BookForge parses the file into chapters, scenes, and paragraphs. Open
   **Structure Audit** on the book page and check the split looks right. If a
   chapter got merged or split oddly, the **Structure Repair Assistant** can
   fix boundaries without touching prose.
3. In **Studio Actions → Prepare Context**, run **Generate Manuscript
   Blueprint** first, then **Generate Chapter Summaries**. The Blueprint is
   the book bible every later prompt reads from (characters, themes, voice,
   continuity rules) — do this before running critics or a rewrite plan.
4. Run **BookForge Critic → Run All Critic Lenses** (baseline stage). You'll
   get eight scored reports: Story Structure, Prose Quality, Continuity,
   Character Depth, Market Fit, Contemporary View, Revision Priorities, and
   Dialogue Density.
5. Open **Rewrite Architect** on the book page. It reads your critic reports
   and builds a plan: guardrails, a coherence contract (voice rules,
   character-permanence rules, timeline rules), and per-chapter directives.
6. Back in Studio Actions, run **Execute Rewrite**. Start with a small batch
   (the default samples ~25 paragraphs spread across chapters) before
   committing to full coverage — it's cheap to check quality on a sample
   first.
7. Go to **Review Draft Revisions**. Every rewritten paragraph sits here as a
   proposal: accept, reject, rerun, or batch-decide. Nothing touches the
   original manuscript until you accept it.
8. Once you're happy with coverage, run **Drift Check** and then **Run All
   Critic Lenses** again with stage set to *post-rewrite* — compare the
   before/after scores in the Critic Scoreboard.
9. Open **Final Manuscript Builder** and export to Markdown, DOCX, EPUB, or
   PDF. Preview the assembly source before committing to a version.

## 2. Create a book from an idea

No manuscript yet — just a premise.

1. **Dashboard → Create a Book From an Idea.**
2. Fill in working title, genre, target audience, language, target pages
   (capped at 150), tone, dialogue density, the core idea, and any
   Contemporary View / boundary notes.
3. Click **Generate Concept Pass**. Review the returned premise, reader
   promise, emotional engine, and suggested structure. Edit any field before
   accepting if it's not quite right — nothing downstream is generated yet.
4. Click **Accept Concept & Generate Architecture**. This produces a full
   part/chapter breakdown with target word counts, key beats, and continuity
   notes per chapter.
5. Click **Accept Architecture** — this is the point a real `books` row gets
   created and you land on the book page.
6. In **Studio Actions → Rewrite & Export**, click **Generate Planned Draft**.
   It drafts up to a handful of chapters per click (the button shows how
   many remain) and confirms through an **AI Task Preflight** dialog — check
   the model/context estimate there before clicking **Proceed**.
7. The **Architecture Roadmap** panel on the book page tracks drafted vs.
   planned chapters and tells you what to do next.
8. Once every chapter is drafted, treat it like an imported manuscript from
   here — or just run **Auto-Review** (see below) and let it take the rest
   of the way to a finished export.

## 3. Tune dialogue density

Dialogue density is a per-book setting — Low, Normal, Above Normal, or High —
that steers how much of the prose should be spoken exchange versus narration.

- **At creation**, it's a field in the idea wizard's intake step, right next
  to Tone. **At import**, it's a field on the import form alongside Genre and
  Point of View.
- It flows into every generation and rewrite prompt automatically — you don't
  need to repeat it anywhere else.
- The **Dialogue Density** critic lens measures it directly: it computes the
  real share of words inside quoted dialogue per chapter (not a guess from
  summaries), scores how close the book-wide average sits to your target
  band, and — just as importantly — flags any chapter that deviates sharply
  from the rest of the book, even if the average looks fine. A book that's
  40% dialogue everywhere except one flat expository chapter will get called
  out for that chapter specifically.
- If a post-rewrite pass only touches a handful of paragraphs in an outlier
  chapter, expect the consistency sub-score to improve gradually, not jump
  to perfect after one small batch — it's measuring real accepted text, not
  intent.

## 4. Let Auto-Review run the whole loop

For when you'd rather describe the goal than drive every step by hand.

1. On the book page, click **Auto-Review Wizard**.
2. Pick a mode: **Full Review** (analyze → critique → rewrite → drift-check →
   re-critique → export), **Make Shorter** (~50% compression before the full
   pipeline), or **Make Longer** (~40% expansion before the full pipeline).
3. Click start. The wizard runs every stage itself, including generating the
   Blueprint if one doesn't exist yet, and shows live progress per stage.
4. It loops the critique → rewrite → re-critique cycle up to three times,
   stopping early once every one of the eight critic lenses scores at least
   70. When it stops looping, it exports and marks the book **finished**.
5. You don't have to babysit it — it's safe to close the tab. See the next
   section for what happens if you do.

## 5. Resume an interrupted Auto-Review run

Laptop went to sleep, network dropped, tab got closed mid-run — it happens.

1. Reopen the book page and click **Auto-Review Wizard** again.
2. If a previous run was interrupted while `running` or ended `failed`, the
   wizard detects it automatically and shows a **Resume available** banner
   listing how many stages already completed.
3. Click **Resume from stage N**. Completed stages are skipped; the run
   continues from the first incomplete one — you don't lose the work already
   done or restart the critique/rewrite loop from scratch.
4. If you'd rather not resume, dismiss the banner and start a fresh run
   instead.

## 6. Choose between LM Studio and a cloud provider

**Settings → AI Settings.**

- **Execution mode: Auto** (default) — critique and planning tasks route to
  your configured cloud provider (if any) for stronger reasoning; summaries,
  Blueprint generation, and rewriting stay on LM Studio to keep volume-heavy
  work local and cheap.
- **Execution mode: Local** — everything runs through LM Studio, regardless
  of whether a cloud provider is configured.
- **Execution mode: Cloud** — everything routes to your configured cloud
  provider.
- Under the **LM Studio** tab, set the base URL (defaults to
  `http://localhost:1234/v1`) and assign a model per task slot: primary
  rewrite, reasoning, extraction, embedding, reranker. The **Model Status**
  panel at the bottom of the page shows what's actually loaded and reachable
  right now, and which configured slot each visible model would be best
  suited for.
- Under the **Cloud Provider** tab, add an API key and model for OpenAI,
  Anthropic, or Google.

## 7. Read the Model Status panel when something misbehaves

Local models don't all behave the same way — some return empty output on
long tasks, some undershoot requested length, some crash outright at a
context size that's actually loaded fine for a different task. BookForge
tracks this per model, per task, and feeds it back into which model gets
picked and what context it's loaded with next time.

- **Settings → Model Status → Recent issues** lists any model+task
  combination with a recorded problem in the last 14 days — for example
  "`gpt-oss-20b-mlx` on rewrite — empty_completion, 3/5 calls." That's telling
  you this exact model, on this exact task, has been unreliable recently;
  BookForge is already deprioritizing it in scoring and will request a
  smaller, previously-successful context the next time it's loaded for that
  task.
- If a task keeps failing across every available model, it's worth checking
  LM Studio itself — is anything actually loaded, does it have enough
  context/memory headroom, is the base URL correct.
- This history is per-user and accumulates automatically; there's nothing to
  configure to turn it on.

## 8. Export and mark a version finished

1. Open **Final Manuscript Builder** on the book page.
2. Choose a format — Markdown, DOCX, EPUB, or PDF — and preview the assembly
   source (which paragraphs/chapters will actually be included) before
   generating.
3. Generate the export. It's saved and downloadable from the book page.
4. To make one export *the* version — the one the dashboard's one-click
   download button points to — mark it **finished**. This doesn't lock the
   manuscript from further revision; it just designates which export is
   current.
