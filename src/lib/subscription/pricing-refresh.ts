import type { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

// A price move under this is noise/rounding, not a real repricing -- skip
// versioning a new row for it.
const CHANGE_EPSILON_USD_MICROS_PER_MILLION = 1000; // $0.001/M tokens

export type PricingRefreshChange = {
  model: string;
  oldInputUsdMicrosPerMillionTokens: number;
  newInputUsdMicrosPerMillionTokens: number;
  oldOutputUsdMicrosPerMillionTokens: number;
  newOutputUsdMicrosPerMillionTokens: number;
};

type OpenRouterModel = { id: string; pricing?: { prompt?: string; completion?: string } };

function usdPerTokenToMicrosPerMillion(usdPerToken: string | undefined): number | null {
  if (!usdPerToken) return null;
  const value = Number(usdPerToken);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1_000_000 * 1_000_000);
}

/**
 * Re-fetches live OpenRouter pricing and versions in a new model_pricing row for
 * any of our tracked models whose rate has genuinely moved (closing out the old
 * "current" row via effective_to, never mutating it in place -- see
 * 202608200003_model_pricing.sql's comment on why this must stay versioned).
 *
 * This is a factual sync, not a business decision -- unlike margin-tuning.ts,
 * nothing here is bounded/logged to pricing_adjustment_log. Fails open: a fetch
 * or parse failure just means pricing stays stale until the next run, which is
 * strictly safer than the alternative of blocking anything on it (Layer B's
 * reserveCreditsForCall already fails closed on a missing/stale price row).
 */
export async function refreshModelPricingFromOpenRouter(supabase: AdminSupabase): Promise<PricingRefreshChange[]> {
  const { data: currentRows, error } = await supabase
    .from("model_pricing")
    .select("model,input_usd_micros_per_million_tokens,output_usd_micros_per_million_tokens")
    .is("effective_to", null);
  if (error || !currentRows || currentRows.length === 0) return [];

  let liveModels: OpenRouterModel[];
  try {
    const res = await fetch(OPENROUTER_MODELS_URL);
    if (!res.ok) return [];
    const body = await res.json();
    liveModels = Array.isArray(body?.data) ? body.data : [];
  } catch {
    return [];
  }

  const liveById = new Map(liveModels.map((m) => [m.id, m]));
  const changes: PricingRefreshChange[] = [];

  for (const row of currentRows) {
    const live = liveById.get(row.model);
    const newInput = usdPerTokenToMicrosPerMillion(live?.pricing?.prompt);
    const newOutput = usdPerTokenToMicrosPerMillion(live?.pricing?.completion);
    if (newInput === null || newOutput === null) continue;

    const inputMoved = Math.abs(newInput - row.input_usd_micros_per_million_tokens) >= CHANGE_EPSILON_USD_MICROS_PER_MILLION;
    const outputMoved = Math.abs(newOutput - row.output_usd_micros_per_million_tokens) >= CHANGE_EPSILON_USD_MICROS_PER_MILLION;
    if (!inputMoved && !outputMoved) continue;

    const now = new Date().toISOString();
    const { error: closeError } = await supabase
      .from("model_pricing")
      .update({ effective_to: now })
      .eq("model", row.model)
      .is("effective_to", null);
    if (closeError) continue;

    const { error: insertError } = await supabase.from("model_pricing").insert({
      model: row.model,
      effective_from: now,
      provider: "openrouter",
      input_usd_micros_per_million_tokens: newInput,
      output_usd_micros_per_million_tokens: newOutput,
      source_note: `Auto-refreshed from live OpenRouter pricing on ${now}.`,
    });
    if (insertError) continue;

    changes.push({
      model: row.model,
      oldInputUsdMicrosPerMillionTokens: row.input_usd_micros_per_million_tokens,
      newInputUsdMicrosPerMillionTokens: newInput,
      oldOutputUsdMicrosPerMillionTokens: row.output_usd_micros_per_million_tokens,
      newOutputUsdMicrosPerMillionTokens: newOutput,
    });
  }

  return changes;
}
