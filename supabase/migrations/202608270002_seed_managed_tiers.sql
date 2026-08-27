-- Seeds the "Managed" tier family (funding_model = 'bookforge_managed', see
-- 202608270001) -- BookForge's own OpenRouter master account funds and
-- mints the scoped key for these subscribers, no key requested from them.
--
-- Pricing: 30% overhead over the equivalent self-funded tier's price, to
-- cover BookForge's now-real OpenRouter cost exposure (self-funded tiers'
-- credit cap costs BookForge nothing -- the user's own account pays it;
-- here BookForge pays it directly). Cap is UNCHANGED from the equivalent
-- self-funded tier -- same real AI-usage budget, the overhead funds
-- BookForge's exposure/risk, not a bigger allowance.
--
-- stripe_price_id is deliberately NOT seeded here, same convention as
-- 202608200009_stripe_billing.sql -- set via a one-off
-- `update subscription_tiers set stripe_price_id = '...' where id = '...'`
-- after creating the matching Products/Prices in the Stripe Dashboard.
insert into public.subscription_tiers
  (id, display_name, monthly_price_usd_cents, monthly_credit_cap_usd_micros, funding_model, sort_order)
values
  ('managed_starter',   'Managed Starter',   1950,  3600000,   'bookforge_managed', 5),
  ('managed_pro',       'Managed Pro',       4550,  18000000,  'bookforge_managed', 6),
  ('managed_studio',    'Managed Studio',    11570, 48000000,  'bookforge_managed', 7),
  ('managed_publisher', 'Managed Publisher', 28470, 180000000, 'bookforge_managed', 8);

-- Model allowlists. Every Managed tier offers all 4 vendors from day one
-- (so vendor-lock works at every level -- see is_model_allowed_for_user in
-- 202608270001) -- unlike the self-funded tiers, which gate vendor access
-- progressively. costTier references are from src/lib/ai/model-catalog.ts.
--
-- Managed Starter: the "low" costTier model from each vendor where one
-- exists (deepseek has two, google has one), plus each vendor's cheapest
-- available entry where no "low" one exists at all -- OpenAI (gpt-5-mini)
-- AND Anthropic (claude-haiku-4.5) both only have a "medium" costTier entry
-- in the catalog, not a genuine gap specific to one vendor. All 4 vendors
-- must be represented here, not just 3, or a vendor-lock to the missing one
-- throws "no models available" for the cheapest tier specifically.
insert into public.subscription_tier_models (tier_id, model, task) values
  ('managed_starter', 'deepseek/deepseek-v4-pro', '*'),
  ('managed_starter', 'deepseek/deepseek-v4-flash', '*'),
  ('managed_starter', 'google/gemini-2.5-flash-lite', '*'),
  ('managed_starter', 'openai/gpt-5-mini', '*'),
  ('managed_starter', 'anthropic/claude-haiku-4.5', '*');

-- Managed Pro: Starter's set plus the "medium" costTier step-up for
-- Google (flash-lite -> flash). Anthropic/OpenAI already present from
-- Starter (see above) -- nothing new to add for them at this level.
insert into public.subscription_tier_models (tier_id, model, task) values
  ('managed_pro', 'deepseek/deepseek-v4-pro', '*'),
  ('managed_pro', 'deepseek/deepseek-v4-flash', '*'),
  ('managed_pro', 'google/gemini-2.5-flash-lite', '*'),
  ('managed_pro', 'openai/gpt-5-mini', '*'),
  ('managed_pro', 'anthropic/claude-haiku-4.5', '*'),
  ('managed_pro', 'google/gemini-2.5-flash', '*');

-- Managed Studio: Pro's set plus both remaining catalog flagships, gated to
-- the highest-leverage tasks (critic/rewrite/planning) the same way
-- self-funded Studio gates Opus -- not opened up for high-volume
-- extraction, to keep flagship pricing off routine calls. Gemini 2.5 Pro is
-- a real Managed-only differentiator: no self-funded tier unlocks it today.
insert into public.subscription_tier_models (tier_id, model, task) values
  ('managed_studio', 'deepseek/deepseek-v4-pro', '*'),
  ('managed_studio', 'deepseek/deepseek-v4-flash', '*'),
  ('managed_studio', 'google/gemini-2.5-flash-lite', '*'),
  ('managed_studio', 'openai/gpt-5-mini', '*'),
  ('managed_studio', 'google/gemini-2.5-flash', '*'),
  ('managed_studio', 'anthropic/claude-haiku-4.5', '*'),
  ('managed_studio', 'anthropic/claude-opus-5', 'critic'),
  ('managed_studio', 'anthropic/claude-opus-5', 'rewrite'),
  ('managed_studio', 'google/gemini-2.5-pro', 'critic'),
  ('managed_studio', 'google/gemini-2.5-pro', 'planning');

-- Managed Publisher: identical allowlist to Managed Studio -- mirrors
-- self-funded Publisher==Studio today (differentiated by price/cap/seats,
-- not model access).
insert into public.subscription_tier_models (tier_id, model, task) values
  ('managed_publisher', 'deepseek/deepseek-v4-pro', '*'),
  ('managed_publisher', 'deepseek/deepseek-v4-flash', '*'),
  ('managed_publisher', 'google/gemini-2.5-flash-lite', '*'),
  ('managed_publisher', 'openai/gpt-5-mini', '*'),
  ('managed_publisher', 'google/gemini-2.5-flash', '*'),
  ('managed_publisher', 'anthropic/claude-haiku-4.5', '*'),
  ('managed_publisher', 'anthropic/claude-opus-5', 'critic'),
  ('managed_publisher', 'anthropic/claude-opus-5', 'rewrite'),
  ('managed_publisher', 'google/gemini-2.5-pro', 'critic'),
  ('managed_publisher', 'google/gemini-2.5-pro', 'planning');
