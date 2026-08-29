import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveManagedSaasTaskModelDefaults, type ModelPrice } from "@/lib/ai/model-catalog";
import { computeOpenRouterKeyLimitUsd, createManagedOpenRouterKey, disableManagedOpenRouterKey } from "@/lib/openrouter/management";
import { getUserSubscriptionTier } from "@/lib/subscription/enforcement";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  vendorLock: z.string().min(1).optional(),
});

/**
 * Onboarding step for the BookForge-managed OpenRouter tier family (see
 * src/lib/openrouter/management.ts): unlike the self_funded BYOT route
 * (src/app/api/onboarding/openrouter-managed-key/route.ts), this asks the
 * user for nothing at all -- no key of any kind. It resolves BookForge's own
 * OPENROUTER_MASTER_MANAGEMENT_KEY server-side and mints a scoped key on
 * BookForge's own OpenRouter account, sized to the user's tier. Kept as a
 * separate route (not a branch of the existing one) so "does this path ever
 * touch the master key based on client input" is auditable at a glance --
 * the answer is always no.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

    const body = schema.parse(await request.json());

    const tierId = (await getUserSubscriptionTier(supabase, user.id)) || "starter";
    const { data: tier, error: tierError } = await supabase
      .from("subscription_tiers")
      .select("funding_model, monthly_credit_cap_usd_micros")
      .eq("id", tierId)
      .single();
    if (tierError || !tier) {
      return NextResponse.json({ ok: false, error: "Could not resolve your subscription tier." }, { status: 500 });
    }
    if (tier.funding_model !== "bookforge_managed") {
      return NextResponse.json(
        { ok: false, error: "Your plan doesn't include BookForge-managed AI. Upgrade to a Managed plan first." },
        { status: 403 },
      );
    }

    // Not resolveOpenRouterManagementKey() -- that resolves which account backs
    // a user's EXISTING scoped key (keyed off user_settings.openrouter_scoped_key_funding_model),
    // which is unset for a first-time signup with no key yet. Live-verified
    // 2026-08-29: calling it here always fell through to the self_funded
    // branch and threw "No OpenRouter management key on file," breaking this
    // route for every first-time BookForge-managed user. The tier check above
    // already establishes this is the bookforge_managed path unambiguously.
    const masterKey = process.env.OPENROUTER_MASTER_MANAGEMENT_KEY;
    if (!masterKey) {
      return NextResponse.json({ ok: false, error: "BookForge-managed AI isn't configured on this deployment." }, { status: 500 });
    }
    const limitUsd = computeOpenRouterKeyLimitUsd(tier.monthly_credit_cap_usd_micros);
    const { hash, apiKey } = await createManagedOpenRouterKey(masterKey, { userId: user.id, limitUsd });

    let taskModels: Record<string, string>;
    try {
      const [{ data: allowedModelRows }, { data: pricingRows }] = await Promise.all([
        supabase.from("subscription_tier_models").select("model").eq("tier_id", tierId).eq("task", "*"),
        supabase
          .from("model_pricing")
          .select("model,input_usd_micros_per_million_tokens,output_usd_micros_per_million_tokens")
          .is("effective_to", null),
      ]);
      const allowedModels = new Set((allowedModelRows ?? []).map((r) => r.model as string));
      const pricing = new Map<string, ModelPrice>(
        (pricingRows ?? []).map((row) => [
          row.model as string,
          {
            inputUsdMicrosPerMillion: row.input_usd_micros_per_million_tokens as number,
            outputUsdMicrosPerMillion: row.output_usd_micros_per_million_tokens as number,
          },
        ]),
      );
      taskModels = resolveManagedSaasTaskModelDefaults(allowedModels, pricing, body.vendorLock ?? null);
    } catch (modelError) {
      await disableManagedOpenRouterKey(masterKey, hash).catch(() => {});
      const message = modelError instanceof Error ? modelError.message : "Could not determine which models your plan allows.";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    const { error: saveError } = await supabase.from("user_settings").upsert(
      {
        user_id: user.id,
        llm_provider: "openrouter",
        llm_api_key: apiKey,
        llm_model: taskModels.rewrite,
        llm_critic_model: taskModels.critic || null,
        llm_rewrite_model: taskModels.rewrite || null,
        llm_planning_model: taskModels.planning || null,
        llm_extraction_model: taskModels.extraction || null,
        execution_mode: "cloud",
        openrouter_scoped_key_hash: hash,
        openrouter_scoped_key_funding_model: "bookforge_managed",
        openrouter_vendor_lock: body.vendorLock ?? null,
      },
      { onConflict: "user_id" },
    );

    if (saveError) {
      await disableManagedOpenRouterKey(masterKey, hash).catch(() => {});
      throw saveError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not set up BookForge-managed AI.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
