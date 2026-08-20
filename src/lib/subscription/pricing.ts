type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export type ModelPricing = {
  inputUsdMicrosPerMillionTokens: number;
  outputUsdMicrosPerMillionTokens: number;
};

/** Looks up the current (effective_to is null) price row for a model. Returns null if unpriced -- an unrecognized/new model shouldn't crash telemetry recording. */
export async function getCurrentModelPricing(supabase: SupabaseClient, model: string): Promise<ModelPricing | null> {
  const { data, error } = await supabase
    .from("model_pricing")
    .select("input_usd_micros_per_million_tokens,output_usd_micros_per_million_tokens")
    .eq("model", model)
    .is("effective_to", null)
    .maybeSingle();

  if (error || !data) return null;
  return {
    inputUsdMicrosPerMillionTokens: data.input_usd_micros_per_million_tokens,
    outputUsdMicrosPerMillionTokens: data.output_usd_micros_per_million_tokens,
  };
}

/** Computes cost in USD micros (1 USD = 1,000,000 micros) for a call's real token usage. */
export function computeCostUsdMicros(promptTokens: number, completionTokens: number, pricing: ModelPricing): number {
  const inputCost = (promptTokens / 1_000_000) * pricing.inputUsdMicrosPerMillionTokens;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputUsdMicrosPerMillionTokens;
  return Math.round(inputCost + outputCost);
}
