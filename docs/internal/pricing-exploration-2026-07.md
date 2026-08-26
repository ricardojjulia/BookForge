# BookForge SaaS Pricing Analysis

Working notes from a cost/pricing session: what a 100-page book actually costs to run through the pipeline via a paid API (OpenRouter), what the competitive market charges, and a proposed pricing structure if BookForge is offered as a hosted service.

## Pipeline cost basis

BookForge's critic module does **not** read the full manuscript — each critic call is built from chapter summaries + book bible JSON, capped at a 24,000-character prompt budget (~6,000 tokens). See `src/lib/critic/prompts.ts:57-58`, `src/lib/critic/run.ts:142-155`. There are 8 critic lenses (`src/lib/types.ts:40-48`), each firing one LLM call per pass (`src/app/api/books/[bookId]/critic/all/route.ts:48`).

**Correction (2026-07-31):** an earlier draft of this doc described the cost driver as "12 rewrite/revision modes, each of which reads and rewrites the entire manuscript." That referred to `src/lib/prompts/revision-modes.ts` / `RevisionMode`, which turned out to have **no callers anywhere in the codebase** — dead/legacy code, since removed. The live rewrite path is `src/lib/rewrite/strategies.ts`: **8 strategies** (`conservative_polish`, `humanized_literary`, `clarity_readability`, `downsize_abridge`, `emotional_depth`, `contemporary_view`, `creative_enhancement`, `custom`), of which a rewrite job applies **exactly one** selected strategy (`getRewriteStrategy`, defaults to `humanized_literary`) — not all of them per cycle.

More importantly, the actual call shape is not "one call rewrites the whole manuscript." `src/app/api/books/[bookId]/rewrite-execute/route.ts:426-492` loops **per paragraph** (`eligibleUnits`), calling `createManagedChatCompletion` once per paragraph. Each call resends the manuscript blueprint, rewrite plan, and context packet (each capped at 7,000 chars, `src/lib/prompts/builders.ts:180-186`) plus chapter summaries, neighboring paragraphs, and voice profile — only `TEXT TO REWRITE` (`buildFullBookRewriteUnitPrompt`, `builders.ts:159-244`) is a single paragraph. That fixed-context overhead is paid **on every paragraph call**, not once per manuscript.

For a 100-page book (≈27,500 words, ≈13 chapters, per the app's own 275-words/page constant in `src/components/books/create-book-wizard.tsx:336`), assuming ~90 words/paragraph (~306 paragraphs — not measured from real data, adjust if you have actual averages):

- **Critic passes**: 8 lenses × 5 passes = 40 calls, ~2,340 input tokens + ~500-1,500 output tokens each → **$0.10–$0.30** even on premium models. Negligible, unaffected by the correction above.
- **One full-manuscript rewrite pass** (one selected strategy, 306 per-paragraph calls): roughly **1.3M–2.4M input tokens** and **~92K output tokens**, depending on how full the 7,000-char context caps run in practice. That's *larger* than this doc's old total pipeline estimate (556K in / 508K out) — for a single rewrite pass alone, before critics or a second strategy pass.

| Pipeline | Models | Cost per rewrite pass (1 strategy, 100-page book) |
|---|---|---|
| Budget | DeepSeek V4 Pro / Gemini 2.5 Flash | **~$0.65 – $1.15** |
| Mid | GLM 5.2 / Claude Haiku 4.5 | **~$1.80 – $3.10** |
| Premium / wasteful | Claude Opus 5 / GPT-5.5, no prompt caching, retries/regens | **~$9 – $15** |

Add critic passes (+$0.10–$0.30) and draft generation (not recomputed here) on top. If an author runs more than one strategy pass on the same manuscript — e.g. a clarity pass followed by a creative-enhancement pass, which the UI allows since each rewrite job is a separate user-triggered action — cost multiplies per pass. **These are estimates from reading the code paths, not measured token counts** — before finalizing pricing tiers, instrument real API usage (input/output tokens per rewrite job) and replace this projection with observed numbers.

The spread across models is still mostly model choice (Opus 5 is ~10x DeepSeek V4 Pro per token here), but the per-paragraph repeated-context overhead means the *floor* is higher than previously estimated, independent of model choice.

Reference pricing pulled live from OpenRouter (Jul 2026):

| Model | Input / 1M | Output / 1M |
|---|---|---|
| DeepSeek V4 Pro | $0.435 | $0.87 |
| GLM 5.2 | $1.12 | $3.52 |
| Gemini 2.5 Flash | $0.30 | $2.50 |
| o4-mini | $1.10 | $4.40 |
| GPT-5 | $1.25 | $10.00 |
| GPT-5.5 | $5.00 | $30.00 |
| Claude Opus 5 | $5.00 | $25.00 |

GLM 5.2 corrected 2026-07-31 against the live OpenRouter catalog — an earlier draft of this doc had it at $0.60/$1.25, which was stale.

## Competitive landscape

| Product | Price/mo | Model | What it does |
|---|---|---|---|
| Novelcrafter | $4–$20 | subscription + **BYO API key** (user pays AI provider directly) | organization/outlining tool, not a generator |
| NovelAI | $10–$25 | flat, "unlimited" generations | chat-style story continuation, smaller in-house models |
| Sudowrite | $10–$59 | credit-metered, same features all tiers | scene-level assistive writing, not full-book autopilot |
| Squibler | $16–$49 | subscription, generous AI usage | full novel platform, still user-driven drafting |

Nobody in this set does draft → 8-lens critic → strategy-driven automated revision as one pipeline — that's BookForge's differentiator. Land pricing inside the existing $10–$30 band rather than above it, since users have no anchor for "hands-off full manuscript" pricing yet.

## Gating model

**Gate by token/word budget ("page-credits"), not book count.** A book isn't a fixed cost unit — page count varies ~10x and revision-mode reruns are user-triggered cost events. Book-count gating either bleeds margin on heavy users or feels stingy to light ones.

- **1 page-credit** = one AI pass over ~275 words (one draft pass or one rewrite-strategy pass on one page).
- **Correction (2026-07-31):** the earlier "100 × 13 passes = 1,300 page-credits" figure assumed all 12 revision modes ran automatically per cycle — that workflow doesn't exist (see Pipeline cost basis, above). The real shape: 1 draft pass + 1 selected rewrite-strategy pass (user picks one of 8, can rerun more if they want another pass) = roughly **100 (draft) + 100 (one strategy pass) = ~200 page-credits** for a single draft-then-revise cycle, before critic sweeps. Each additional strategy rerun the author triggers adds another ~100 page-credits. This makes a 100-page book cheaper in credits than previously modeled, *if* the $/page-credit rate stays the same — but that rate itself was derived from the old linear "$X per word" assumption, and real per-paragraph cost is dominated by fixed context overhead resent on every call (see Pipeline cost basis). Re-derive $/page-credit from measured token usage before locking in the Proposed pricing table below.
- **Critic passes are bundled unlimited** — even 5 full passes cost $0.10–$0.30, not worth metering; market it as a value-add instead.
- **Model tier is gated separately from volume** — flagship models cost 20-25x more per token than the workhorse tier, so plans cap *which* models they can call, not just how many credits.
- **No flat "unlimited" tier.** Unlike NovelAI (likely cheaper in-house models), BookForge's real per-token cost is nontrivial on flagship models, and unlimited invites regeneration-loop abuse that blows margin. Rejected.

## Proposed pricing

| Tier | Price/mo | AI cost paid by | Cap |
|---|---|---|---|
| Free | $0 | platform | 150 page-credits |
| Starter | $9 | platform | 1,200 page-credits (~1 full 100pg book) |
| Pro | $24 | platform | 4,500 page-credits |
| Studio | $59 | platform | 15,000 page-credits |
| **BYO-Key** | **$15 flat** | **user's own OpenRouter/provider key** | no page-credit cap — full pipeline access |

At the workhorse model tier (~$0.0007–0.001/page-credit), Starter's 1,200 credits cost ~$1 against $9 charged — over 85% gross margin, covering free-tier losses and infra overhead.

**BYO-Key lane**: user connects their own API key (BookForge's `llm_provider` config already supports pluggable providers — `src/lib/lmstudio/settings.ts` — so this is a billing/gating change, not new plumbing). All AI calls route through their key; BookForge never touches token cost, so the $15 flat fee is close to pure margin against infra cost alone. This captures the price-sensitive/power-user segment that would otherwise churn to Novelcrafter, without cannibalizing the hosted tiers (no-setup-friction users who'd go to Sudowrite/Squibler instead).

Guardrail needed on BYO-Key: cap **concurrency** (e.g. one active generation/revision job per account), not credits — otherwise it's unlimited load on the job queue/DB with nothing to stop it being used as a bare API proxy.

Open question not yet resolved: whether BYO-Key should be a standalone plan (as modeled above) or a toggle available within Pro/Studio to remove their credit cap.
