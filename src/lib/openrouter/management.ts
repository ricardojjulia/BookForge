/**
 * OpenRouter Management/Provisioning API client.
 *
 * Wraps https://openrouter.ai/api/v1/keys -- used to create/update/disable a
 * scoped API key sized to a user's BookForge subscription tier. That scoped
 * key -- never a management key -- becomes the actual key used for
 * completions (see src/lib/ai/providers.ts's createProviderClient, which
 * reads it unchanged from settings.apiKey).
 *
 * Two funding models share this same wrapper (see resolveOpenRouterManagementKey
 * below): "self_funded" mints the scoped key on the USER's own OpenRouter
 * account using a management key they supplied; "bookforge_managed" mints it
 * on BookForge's own OpenRouter account using one shared master key
 * (OPENROUTER_MASTER_MANAGEMENT_KEY). Every function below is agnostic to
 * which -- they just take whichever management key string the caller
 * resolved.
 *
 * FLAGGED FOR LIVE VERIFICATION: this module was written against OpenRouter's
 * documented field names (name, limit, disabled, limitReset,
 * includeByokInLimit) but has NOT been exercised against a real OpenRouter
 * account. Before this ships, confirm against a live call: (1) exact field
 * casing in request/response bodies, (2) the created-key response shape
 * (hash + one-time key string), (3) that PATCH limit is cumulative against
 * lifetime `usage`, not a period-based reset, (4) the exact status/body when
 * a scoped key's limit is exceeded on a real chat completion (isOpenRouterKeyLimitExceededError's
 * 402 guess below is unverified). See the plan's §7 verification steps.
 */

const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/keys";

// Keep in sync by hand with v_bonus_multiplier in
// supabase/migrations/202608260002_tier_credit_bonus_multiplier.sql --
// Postgres and TypeScript can't share one literal. Change both together.
export const TIER_CREDIT_BONUS_MULTIPLIER = 1.2;

export function computeOpenRouterKeyLimitUsd(tierCapUsdMicros: number): number {
  const rawUsd = (tierCapUsdMicros / 1_000_000) * TIER_CREDIT_BONUS_MULTIPLIER;
  return Math.round(rawUsd * 100) / 100;
}

type OpenRouterKeyResponse = {
  data: {
    hash: string;
    name?: string;
    label?: string;
    limit: number | null;
    disabled: boolean;
    usage?: number;
    limit_remaining?: number | null;
  };
  key?: string; // one-time plaintext key, only present on create
};

async function openRouterKeysRequest(
  managementApiKey: string,
  path: string,
  init: { method: string; body?: Record<string, unknown> },
): Promise<OpenRouterKeyResponse> {
  const res = await fetch(`${OPENROUTER_KEYS_URL}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${managementApiKey}`,
      "content-type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`OpenRouter key management request failed (${res.status}): ${bodyText || res.statusText}`);
  }

  return res.json() as Promise<OpenRouterKeyResponse>;
}

export async function createManagedOpenRouterKey(
  managementApiKey: string,
  input: { userId: string; limitUsd: number },
): Promise<{ hash: string; apiKey: string; limit: number }> {
  const response = await openRouterKeysRequest(managementApiKey, "", {
    method: "POST",
    body: {
      name: `BookForge — ${input.userId}`,
      limit: input.limitUsd,
      limitReset: null,
    },
  });

  if (!response.key) {
    throw new Error("OpenRouter did not return a key string when creating the managed key.");
  }

  return { hash: response.data.hash, apiKey: response.key, limit: response.data.limit ?? input.limitUsd };
}

/**
 * OpenRouter's `limit` is a lifetime-cumulative ceiling, not period-based
 * (limitReset is left null -- see the module doc comment on why). A naive
 * PATCH { limit: newPeriodCapUsd } would under-grant by whatever's already
 * been spent against this key's lifetime, so this reads current `usage`
 * first and sets limit = usage + newPeriodCapUsd.
 */
export async function updateManagedOpenRouterKeyLimit(
  managementApiKey: string,
  keyHash: string,
  newPeriodCapUsd: number,
): Promise<void> {
  const current = await openRouterKeysRequest(managementApiKey, `/${keyHash}`, { method: "GET" });
  const usage = current.data.usage ?? 0;
  await openRouterKeysRequest(managementApiKey, `/${keyHash}`, {
    method: "PATCH",
    body: { limit: usage + newPeriodCapUsd },
  });
}

/** Reversible (not DELETE) -- a resubscribe re-enables the same key string, no re-onboarding needed. */
export async function disableManagedOpenRouterKey(managementApiKey: string, keyHash: string): Promise<void> {
  await openRouterKeysRequest(managementApiKey, `/${keyHash}`, {
    method: "PATCH",
    body: { disabled: true },
  });
}

export async function getManagedOpenRouterKeyUsage(
  managementApiKey: string,
  keyHash: string,
): Promise<{ limit: number | null; usage: number; limitRemaining: number | null; disabled: boolean }> {
  const response = await openRouterKeysRequest(managementApiKey, `/${keyHash}`, { method: "GET" });
  return {
    limit: response.data.limit,
    usage: response.data.usage ?? 0,
    limitRemaining: response.data.limit_remaining ?? null,
    disabled: response.data.disabled,
  };
}

/**
 * Heuristic for "this failure means the scoped key's OpenRouter-side limit
 * was hit" -- used by src/lib/lmstudio/client.ts to map into
 * InsufficientCreditsError so it flows through the already-shipped
 * isInsufficientCreditsMessage/InsufficientCreditsAlert UI path.
 *
 * UNVERIFIED: initial guess is HTTP 402, consistent with OpenRouter's
 * documented general use of 402 for insufficient-credit conditions -- but
 * this specific case (a scoped key's own `limit` exceeded, not the
 * underlying account out of funds) has not been triggered against a real
 * key. Confirm and tighten this before shipping (plan §7, step 2).
 */
export function isOpenRouterKeyLimitExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /\b402\b/.test(error.message) && /limit/i.test(error.message);
}

type ManagementKeySupabaseClient =
  | Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>
  | ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

/**
 * Resolves which OpenRouter Management/Provisioning key authorizes changes
 * to a user's active scoped key -- BookForge's own env-level master key for
 * a bookforge_managed user, or the user's own vaulted key (via
 * get_openrouter_management_key) for a self_funded one.
 *
 * Deliberately keyed off openrouter_scoped_key_funding_model (which account
 * minted the CURRENT key), not the user's live subscription tier -- a
 * scoped key lives permanently on whichever account created it, but tier
 * funding_model can change out from under it on upgrade/downgrade. Callers
 * that need to detect a funding-model mismatch (the key's origin no longer
 * matching the user's current tier) must compare
 * openrouter_scoped_key_funding_model against the tier row themselves --
 * see syncOpenRouterManagedKeyLimit in src/lib/billing/webhook-handlers.ts.
 */
export async function resolveOpenRouterManagementKey(
  supabase: ManagementKeySupabaseClient,
  userId: string,
): Promise<string> {
  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("openrouter_scoped_key_funding_model")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  if (settings?.openrouter_scoped_key_funding_model === "bookforge_managed") {
    const masterKey = process.env.OPENROUTER_MASTER_MANAGEMENT_KEY;
    if (!masterKey) throw new Error("OPENROUTER_MASTER_MANAGEMENT_KEY is not configured.");
    return masterKey;
  }

  const { data: managementKey, error: rpcError } = await supabase.rpc("get_openrouter_management_key", { p_user_id: userId });
  if (rpcError || !managementKey) throw rpcError || new Error(`No OpenRouter management key on file for user ${userId}.`);
  return managementKey as string;
}
