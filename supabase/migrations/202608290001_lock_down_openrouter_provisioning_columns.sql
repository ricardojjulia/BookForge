-- user_settings has always allowed a user to write every column on their own
-- row (RLS policy "settings own" is row-level only: user_id = auth.uid()).
-- That's correct for ordinary settings, but 5 columns are provisioning state
-- that only server-side code (the two onboarding routes, and the Stripe
-- webhook handlers) is meant to ever set -- a user could otherwise, via a
-- direct API call bypassing the Settings UI entirely (which already hides
-- these fields, but only client-side), overwrite openrouter_scoped_key_hash
-- or openrouter_scoped_key_funding_model to point BookForge's own billing
-- sync (which runs with the real OpenRouter master key) at a different scoped
-- key hash than the one BookForge actually minted for them.
--
-- Both INSERT and UPDATE are granted table-wide (no column scoping) on this
-- table -- live-verified that a table-wide grant fully supersedes any
-- column-level REVOKE for BOTH privilege types (a column-level REVOKE INSERT
-- or REVOKE UPDATE on a single column is silently bypassed as long as the
-- table-wide grant still exists). So restricting these 5 columns requires
-- revoking the table-wide grants first and re-granting both privileges only
-- for the columns that should stay user-writable.
--
-- Deliberately an explicit allowlist (not a denylist of just these 5):
-- fail-closed for any future column added to this table, consistent with
-- this codebase's other "unknown must not be silently treated as safe"
-- choices (e.g. reserveCreditsForCall's unpriced-model guard). A new
-- ordinary settings column will need a line added below to become
-- user-writable -- that's the intended tradeoff for a provisioning-security
-- boundary.
revoke insert, update on public.user_settings from authenticated, anon;

-- The column list must be repeated for each keyword -- `grant insert, update
-- (cols)` (no repeat) parses INSERT as table-wide and only UPDATE as
-- column-scoped, silently granting unrestricted INSERT. Verified against a
-- live query before relying on this.
grant insert (
  id, user_id, lmstudio_base_url, primary_rewrite_model, reasoning_model, extraction_model,
  embedding_model, reranker_model, quality_profile, context_window_tokens, max_output_tokens,
  temperature, top_p, repeat_penalty, streaming_enabled, default_revision_recipe_id, created_at,
  updated_at, llm_provider, llm_api_key, llm_model, llm_base_url, llm_temperature,
  llm_max_output_tokens, execution_mode, onboarding_completed_steps, llm_critic_model,
  llm_rewrite_model, llm_planning_model, llm_extraction_model, openrouter_vendor_lock
), update (
  id, user_id, lmstudio_base_url, primary_rewrite_model, reasoning_model, extraction_model,
  embedding_model, reranker_model, quality_profile, context_window_tokens, max_output_tokens,
  temperature, top_p, repeat_penalty, streaming_enabled, default_revision_recipe_id, created_at,
  updated_at, llm_provider, llm_api_key, llm_model, llm_base_url, llm_temperature,
  llm_max_output_tokens, execution_mode, onboarding_completed_steps, llm_critic_model,
  llm_rewrite_model, llm_planning_model, llm_extraction_model, openrouter_vendor_lock
) on public.user_settings to authenticated, anon;
