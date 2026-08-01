# BookForge Pricing Notes

Date: 2026-07-31

## Cost Baseline

For a 100-page book, 5 full passes of every BookForge critic is cheap in raw API cost: roughly $0.75 to $2.50 per book on efficient OpenRouter models, assuming full-manuscript critic calls.

BookForge currently has 8 critic lenses:

- Story Structure
- Prose Quality
- Continuity
- Character Depth
- Market Fit
- Contemporary View
- Revision Priorities
- Dialogue Density

That means:

```text
8 critics x 5 passes = 40 critic calls
```

Assumption: 100 pages is about 25,000 words / 33,000 tokens. With prompts, book bible, summaries, and related context, estimate about 40,000 input tokens per critic call plus 2,000 output tokens per JSON critique.

```text
40 calls x 40k input = 1.6M input tokens
40 calls x 2k output = 80k output tokens
```

Approximate raw OpenRouter cost from the earlier estimate:

| Model | Price Signal | 5x All Critics Estimate |
|---|---:|---:|
| DeepSeek V4 Pro | $0.435/M input, $0.87/M output | ~$0.77 |
| Gemini 2.5 Flash | $0.30/M input, $2.50/M output | ~$0.68 |
| Gemini 3 Flash Preview | $0.50/M input, $3.00/M output | ~$1.04 |
| GLM 5.2 | $1.12/M input, $3.52/M output | ~$2.07 |
| o4-mini | $1.10/M input, $4.40/M output | ~$2.11 |

OpenRouter PAYG credit purchase fees and model output/thinking-token behavior should be included in margin assumptions.

For book generation plus evaluation, a conservative planning budget is:

```text
Budget API cost per 100-page book: $2-$8
Premium / wasteful pipeline budget: $10-$20
```

## Market Positioning

BookForge should not be priced like raw AI tokens. It should be priced like an author workflow product with AI usage bundled.

Market signals discussed:

| Product Type | Examples | Price Signal |
|---|---|---:|
| Traditional writing/formatting | Reedsy Studio, Dabble, LivingWriter, Atticus | Free to ~$29/mo, or one-time ~$147 |
| AI author assistant | Sudowrite, Squibler | ~$19-$59/mo |
| BYOK AI author workspace | Novelcrafter | ~$8-$20/mo plus user-paid model costs |
| Business AI content suite | Jasper | ~$69/mo+ |

Competitive position:

```text
More expensive than plain writing software.
Comparable to Sudowrite/Squibler.
Cheaper and more author-specific than Jasper.
Easier than Novelcrafter because AI is bundled, not BYOK.
```

Do not compete as "unlimited AI writing." That attracts abusive usage and makes margins hard to control.

Compete as:

```text
AI book studio for drafting, revision, critic review, continuity, and publishing-ready exports.
```

## Gating Strategy

Do not expose tokens to users. Authors think in books, pages, drafts, chapters, edits, and review cycles.

Best external gates:

- Active books
- AI page-credits
- Full critic sweeps
- Premium model access
- Priority queue / team features for higher tiers

Internal conversion:

```text
1 manuscript page = about 250 words = about 350 tokens
1 full critic sweep = all 8 critics run once
5 full critic sweeps = 40 critic calls
```

The important language correction:

```text
1 page-credit = one manuscript page processed by one AI operation.
A full-book workflow uses multiple operations per page.
```

Suggested conversion:

```text
100-page draft generation: ~100-200 page-credits
100-page rewrite pass: ~100-200 page-credits
100-page full critic sweep: ~100 page-credits
100-page full revision cycle: ~400-600 page-credits
100-page heavy 5-pass critic cycle: ~900-1,200 page-credits
```

## Fact-Checked Tier Table

Original proposal:

| Tier | Price/mo | Page-Credits | Model Access | Roughly Maps To |
|---|---:|---:|---|---|
| Free | $0 | 150 | budget tier only | one short draft, no full revision cycle |
| Starter | $12 | 1,500 | budget/mid tier | ~1 full 100pg book, 1 revision cycle |
| Pro | $35 | 5,000 | + premium tier unlockable | ~3-4 books, or 1 book with heavy re-rolls |
| Studio | $89 | 15,000 | full access | prolific/agency use, ~10 books |

Verdict:

| Tier | Verdict | Notes |
|---|---|---|
| Free, $0, 150 credits | Reasonable, but maybe low | 150 page-credits needs to feel intentionally limited, not stingy. |
| Starter, $12, 1,500 credits | Competitive | Below Sudowrite's $19 monthly Hobby plan and near its lower annualized entry pricing. |
| Pro, $35, 5,000 credits | Strong | Between Sudowrite Professional monthly at about $29 and Max monthly at about $59. |
| Studio, $89, 15,000 credits | Plausible | Needs agency/team/export/premium value because it exceeds many solo-author tools. |

Recommended cleaned-up version:

| Tier | Price/mo | Page-Credits | Model Access | Positioning |
|---|---:|---:|---|---|
| Free | $0 | 150 | Budget models only | Try a short draft, outline, or sample critique |
| Starter | $12 | 1,500 | Budget + mid models | One full 100-page book workflow per month |
| Pro | $35 | 5,000 | Premium models available via credits | 3-5 book workflows or one heavily revised manuscript |
| Studio | $89 | 15,000 | Full model access, priority queue | Agency/prolific author tier, around 10 book workflows |

## Recommended Add-Ons

| Add-On | Price |
|---|---:|
| +500 AI pages | $9 |
| +2,000 AI pages | $29 |
| +10 critic sweeps | $15 |
| Premium model pass | $10-$25 |
| Extra active book slot | $5-$10/mo |

## Final Recommendation

Keep the proposed prices. They are competitive.

The thing to fix is the language: sell book workflows, meter internally by page-credits, and avoid implying that 1,500 credits equals only 100 pages unless the multiplier is defined.

