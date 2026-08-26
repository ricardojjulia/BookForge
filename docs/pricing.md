# Pricing

BookForge is free to self-host — see [SELF_HOSTING.md](SELF_HOSTING.md). This
page describes how pricing works for the **managed SaaS** offering at
[bookforgeai.io](https://bookforgeai.io). For the current dollar figures,
bookforgeai.io itself is the source of truth; this page describes the model,
which is more stable than any specific number on it.

## The trial

Every account starts with a real 14-day trial — no credit card required. It's
gated by a small, hard spend cap on AI usage, not a stripped-down feature set:
the full pipeline (critic, rewrite, export) is available during the trial,
just with a ceiling on how much it can cost. In practice, that cap survives a
full day of real work — including a rough debugging session with plenty of
retried calls — and still leaves room to spare.

Trials don't reset by deleting and recreating an account with the same email;
a signup that's already drawn a trial gets access gated behind an actual
subscription instead of another free trial.

## Subscription tiers

Once a trial ends (or a subscriber upgrades), access is **tier-gated by
model**, not by a soft "recommended model" preference. Each tier is bound to
an explicit allowlist of which AI models it can call, enforced at the point
every AI call is made — not just hidden in the UI. Four tiers, each opening up
a wider (and more expensive) model roster:

| Tier | What it unlocks |
|---|---|
| **Starter** | The workhorse model for the full pipeline (draft, critic, rewrite) |
| **Pro** | Starter, plus faster/cheaper models for high-volume tasks |
| **Studio** | Pro, plus a premium model for the heaviest reasoning tasks (rewrite architecture, critic) |
| **Publisher** | Studio, plus the highest ceiling for agency/multi-book usage |

Current prices and the exact model roster per tier are shown at
[bookforgeai.io](https://bookforgeai.io) during signup/checkout, since these
are the numbers most likely to change as model pricing shifts — deliberately
not duplicated here.

## Bring your own key

Prefer not to be tier-gated at all? Self-host this repo and bring your own
OpenRouter API key (or a local model via LM Studio) — see
[SELF_HOSTING.md](SELF_HOSTING.md). The managed-SaaS billing and credit system
never enters that path; it's a genuinely free, unmetered option for anyone
willing to run their own instance.
