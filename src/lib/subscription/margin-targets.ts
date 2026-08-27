// Shared target-margin tables for both automated tuning passes --
// margin-tuning.ts (self_funded tiers: tunes credit_cap, proposes
// model_allowlist reviews) and managed-price-tuning.ts (bookforge_managed
// tiers: tunes subscription price instead, credit cap frozen). Both need a
// per-tier target margin to drive their respective decisions, so the tables
// live here rather than in either module, to avoid one tuning module
// depending on the other's internals.

// "Margin @ typical" from the redone tier cost analysis (docs/pricing plan) --
// the band margin-tuning.ts steers the credit cap toward, and the floor below
// which it proposes (never applies) an allowlist review. Publisher's target
// was raised from 0.52 to 0.56 alongside its $199->$219 price correction (see
// 202608200008_publisher_tier_price_correction.sql) -- the original 0.52 was
// paired with a 9.5% worst-case floor margin that was flagged as too thin.
export const TARGET_MARGIN: Record<string, number> = { starter: 0.92, pro: 0.76, studio: 0.73, publisher: 0.56 };

// Starting points derived from the 30%-overhead pricing decision (managed
// price = 1.3x the self-funded equivalent's price, same real-cost profile --
// see 202608270002_seed_managed_tiers.sql). Used by managed-price-tuning.ts
// to compute a target price, and by margin-tuning.ts's model_allowlist
// proposal check (the credit-cap branch is frozen for these tiers -- see
// margin-tuning.ts). Confirm against real trailing cost data once managed
// tiers have live subscribers; these are starting points, not load-bearing
// precision.
export const TARGET_MARGIN_MANAGED: Record<string, number> = {
  managed_starter: 0.93,
  managed_pro: 0.81,
  managed_studio: 0.79,
  managed_publisher: 0.66,
};
