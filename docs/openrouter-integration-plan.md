# OpenRouter Integration Plan

Date: 2026-07-31

Companion to `docs/pricing.md` / `pricing-codex.md`, which already assume OpenRouter as the cost basis. This doc covers (1) how to actually wire OpenRouter into the existing provider architecture and (2) which specific OpenRouter models to use where, optimized for speed + cost.

## 1. Why this is a small change, not a new subsystem

BookForge already normalizes every LLM provider to the OpenAI SDK's `chat.completions.create` shape:

- `src/lib/ai/providers.ts:73-111` (`createProviderClient`) — a `switch` on provider that returns a configured `new OpenAI({ baseURL, apiKey, ... })` client. LM Studio, OpenAI, Anthropic, and Google all go through this same OpenAI-SDK client, just pointed at different `baseURL`s (Anthropic and Google are called via their OpenAI-compatible endpoints).
- `src/lib/lmstudio/client.ts:239-302` (`createManagedChatCompletion`) — the single call site (`client.chat.completions.create(...)`, line 255) used by every feature: all 8 critics, draft generation, rewrite/revision, chat, etc.
- Everything is request/response (`stream: false`), never token-streamed to the browser — progress instead comes from polling job/heartbeat rows.

OpenRouter is itself an OpenAI-compatible endpoint (`https://openrouter.ai/api/v1`) that fronts hundreds of models under one API key. Because the existing architecture already treats every provider as "OpenAI SDK + baseURL + key," OpenRouter drops in as **one more case**, not a new abstraction — and it's arguably a simplification, since one OpenRouter key replaces separately managing OpenAI/Anthropic/Google keys for cloud execution.

## 2. Code changes required

1. **`src/lib/types.ts:50`** — extend `LlmProvider` union: `"lmstudio" | "openai" | "anthropic" | "google" | "openrouter"`.
2. **`src/lib/ai/providers.ts:34-62`** (`PROVIDER_META`) — add an entry:
   ```ts
   {
     id: "openrouter",
     label: "OpenRouter",
     requiresApiKey: true,
     defaultBaseUrl: "https://openrouter.ai/api/v1",
     defaultModels: getCloudModelsForProvider("openrouter"), // new catalog entries, see §3
   }
   ```
   The settings UI (`src/components/settings/settings-form.tsx:421-483`) renders its provider dropdown, model select, and API-key field directly off this array — no UI code changes needed.
3. **`src/lib/ai/providers.ts:73-111`** (`createProviderClient`) — add a case:
   ```ts
   case "openrouter":
     return new OpenAI({
       baseURL: settings.baseUrl ?? "https://openrouter.ai/api/v1",
       apiKey: settings.apiKey ?? process.env.OPENROUTER_API_KEY,
       defaultHeaders: {
         "HTTP-Referer": "https://bookforge.app", // or actual prod URL
         "X-Title": "BookForge",
       },
     });
   ```
   The `HTTP-Referer`/`X-Title` headers are optional but get the app listed correctly in OpenRouter's usage dashboard/rankings — worth setting.
4. **`src/lib/ai/providers.ts:158-176`** (`getStandardLlmSettingsFromEnv`) — add `OPENROUTER_API_KEY` alongside the existing `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GOOGLE_API_KEY` reads.
5. **`.env.example`** — currently only documents `LMSTUDIO_*` vars even though the code already reads `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GOOGLE_API_KEY`. Add all of these plus `OPENROUTER_API_KEY` while touching this file.
6. **`src/lib/ai/model-catalog.ts:35-131`** (`CLOUD_MODEL_CATALOG`) — add an OpenRouter section with the model IDs from §3 below (OpenRouter IDs are namespaced, e.g. `deepseek/deepseek-v4-pro`, `google/gemini-2.5-flash-lite`).
7. **`supabase/migrations/...standard_llm_provider.sql`** — no schema change needed (`llm_provider` has no CHECK constraint), just update the descriptive comment to mention `openrouter`.

No streaming plumbing, no DB migration, no new UI components.

**Known gap to flag, not fix here:** the exploration found that `src/lib/prompts/revision-modes.ts` (the 12 "revision modes" that `docs/pricing.md`'s cost math is built on) has **no callers anywhere in `src/`** — it looks like dead code. The live rewrite path is `src/lib/rewrite/strategies.ts`, which has 8 strategies, not 12. Worth resolving before the pricing docs' per-book cost estimates are treated as final, since "12 full-manuscript passes" vs "8 strategies" changes the token math materially.

## 3. Model selection — fast, cheap, OpenRouter-available

Pulled from OpenRouter's live model catalog (`GET /api/v1/models`, checked 2026-07-31). All of these support `structured_outputs`/`response_format` (needed for critic JSON) and are OpenAI-SDK-compatible with no code changes beyond the model ID string.

### Tier A — Critic lenses (high volume: 8 lenses × up to 5 passes = 40 calls/book, short prompt, JSON output, latency-sensitive)

| Model | Input $/M | Output $/M | Context | Notes |
|---|---:|---:|---:|---|
| **`google/gemini-2.5-flash-lite`** (recommended default) | $0.10 | $0.40 | 1M | Google's latency-optimized tier; cheapest reliable mainstream option; strong uptime |
| `deepseek/deepseek-v4-flash` | $0.14 | $0.28 | 1M | Cheapest of the shortlist; MoE, 13B active params — fast; good fallback/alt |
| `openai/gpt-5-nano` | $0.05 | $0.40 | 400K | Cheapest OpenAI tier if you want provider diversity for the routing pool |

At Tier A pricing, 40 critic calls/book (per the existing ~40K-in/2K-out-per-call estimate in `pricing-codex.md`) cost roughly **$0.19–$0.25/book** — critic cost is a rounding error regardless of which of these three you pick, so optimize for reliability/uptime over the last fraction of a cent. Default to `google/gemini-2.5-flash-lite`.

### Tier B — Full-manuscript revision/rewrite passes (the actual cost driver — reads+rewrites the whole book per pass)

| Model | Input $/M | Output $/M | Context | Notes |
|---|---:|---:|---:|---|
| **`deepseek/deepseek-v4-pro`** (recommended default) | $0.435 | $0.87 | 1M | This is the model `pricing-codex.md`'s numbers were already built around; best cost/quality balance in this tier |
| `google/gemini-2.5-flash` | $0.30 | $2.50 | 1M | Cheaper input, pricier output — better if your passes are input-heavy (they mostly are, given full-manuscript context) |
| `z-ai/glm-5.2` | $1.12 | $3.52 | 1M | **Price correction**: `pricing-codex.md` lists GLM 5.2 at $0.60/$1.25 — that's stale. Live OpenRouter price is $1.12/$3.52, roughly 2.7x the doc's assumption. Worth updating the pricing doc. |

Default to `deepseek/deepseek-v4-pro`.

### Tier C — Premium / Pro & Studio tier unlock (flagship quality, still reasonably fast)

| Model | Input $/M | Output $/M | Context | Notes |
|---|---:|---:|---:|---|
| `anthropic/claude-haiku-4.5` | $1.00 | $5.00 | 200K | Fast + strong prose/instruction-following; good "premium but not wasteful" option |
| `openai/gpt-5-mini` | $0.25 | $2.00 | 400K | Cheapest true premium tier, OpenAI quality |
| `google/gemini-2.5-pro` | $1.25 | $10.00 | 1M | Flagship-tier reasoning if a critic/revision pass genuinely needs it |

### Explicitly avoid as defaults

`anthropic/claude-opus-5` ($5/$25) and `openai/gpt-5.5` ($5/$30) — confirmed still on OpenRouter, ~15-25x the cost of the Tier B pick for the same manuscript-rewrite workload, per `docs/pricing.md`'s own "premium/wasteful" cost band ($18-35/book). Fine as an opt-in Studio-tier toggle, wrong as any kind of default.

## 4. OpenRouter-specific cost/reliability controls worth adopting

These require no schema change — they're per-request routing hints passed in the `chat.completions.create` body (the `openai` SDK will pass through extra fields):

- **`quantizations` filter** — cheapest endpoints for a given model ID sometimes route to FP8/INT8-quantized weights from a specific provider. Pin `provider: { quantizations: ["fp16", "bf16"] }` if a critic starts producing degraded JSON, to rule out a quantized backend as the cause.
- **`provider.max_price`** — hard ceiling (e.g. `{ prompt: 2, completion: 5 }` in $/M) as a safety net against OpenRouter routing a request to an unexpectedly expensive backend for a given model ID.
- **`:floor` model suffix** (e.g. `deepseek/deepseek-v4-pro:floor`) — routes to the cheapest available provider for that model. Reasonable default for Tier A/B batch work where latency variance across providers doesn't matter much.
- **BYOK relevance**: `docs/pricing.md`'s proposed "BYO-Key" tier (user supplies their own provider key) maps directly onto OpenRouter's own BYOK support — a user's OpenAI/Anthropic/Google key can be registered *with OpenRouter* and OpenRouter waives its ~5% fee for the first 1M requests/month. That could mean the BYO-Key tier routes through the same OpenRouter integration instead of needing separate bespoke plumbing per provider — worth a follow-up look once this base integration lands.

## 5. Open decisions

- Confirm `google/gemini-2.5-flash-lite` and `deepseek/deepseek-v4-pro` as the Tier A/B defaults, or prefer single-provider consistency (all-DeepSeek, or all-Google) for simpler support/debugging.
- Decide whether to resolve the dead `revision-modes.ts` vs. live `rewrite/strategies.ts` discrepancy before finalizing per-book cost estimates (§2 gap).
- Decide default routing hint policy (`:floor` vs plain model ID) for Tier A/B calls.
