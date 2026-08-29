import { NextResponse } from "next/server";
import { z } from "zod";
import { assertIsOpenRouterManagementKey } from "@/lib/ai/providers";
import {
  computeOpenRouterKeyLimitUsd,
  createManagedOpenRouterKey,
  disableManagedOpenRouterKey,
} from "@/lib/openrouter/management";
import { getUserSubscriptionTier } from "@/lib/subscription/enforcement";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  managementApiKey: z.string().min(1),
  model: z.string().min(1),
  taskModels: z
    .object({
      critic: z.string().optional(),
      rewrite: z.string().optional(),
      planning: z.string().optional(),
      extraction: z.string().optional(),
    })
    .partial()
    .optional(),
});

/**
 * Onboarding step for the managed-SaaS "BYOT" OpenRouter path (see
 * src/lib/openrouter/management.ts): takes the user's OpenRouter Management/
 * Provisioning key, mints a scoped, spend-capped key on their own account
 * sized to their subscription tier, and persists both (the management key
 * for later limit updates, the scoped key as the actual completions key) in
 * one call. Self-hosted OpenRouter onboarding does not use this route -- it
 * keeps saving a plain personal key via the wizard's generic saveSettings().
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

    const body = schema.parse(await request.json());

    await assertIsOpenRouterManagementKey(body.managementApiKey);

    // Same fail-safe default as is_model_allowed_for_user()'s SQL-side
    // coalesce -- a brand-new user with no billing flow run yet still gets a
    // key, sized to Starter.
    const tierId = (await getUserSubscriptionTier(supabase, user.id)) || "starter";
    const { data: tier, error: tierError } = await supabase
      .from("subscription_tiers")
      .select("monthly_credit_cap_usd_micros")
      .eq("id", tierId)
      .single();
    if (tierError || !tier) {
      return NextResponse.json({ ok: false, error: "Could not resolve your subscription tier." }, { status: 500 });
    }

    const limitUsd = computeOpenRouterKeyLimitUsd(tier.monthly_credit_cap_usd_micros);
    const { hash, apiKey } = await createManagedOpenRouterKey(body.managementApiKey, {
      userId: user.id,
      limitUsd,
    });

    // Admin client, not the user's own session -- openrouter_management_key,
    // openrouter_scoped_key_hash, and openrouter_scoped_key_funding_model are
    // locked down (migration 202608290001) so a user can no longer write them
    // directly via their own RLS-gated session, only server code acting on
    // their already-verified identity above can. See that migration's
    // comment for why.
    const admin = createAdminClient();
    const { error: saveError } = await admin.from("user_settings").upsert(
      {
        user_id: user.id,
        llm_provider: "openrouter",
        llm_api_key: apiKey,
        llm_model: body.model,
        llm_critic_model: body.taskModels?.critic || null,
        llm_rewrite_model: body.taskModels?.rewrite || null,
        llm_planning_model: body.taskModels?.planning || null,
        llm_extraction_model: body.taskModels?.extraction || null,
        execution_mode: "cloud",
        openrouter_management_key: body.managementApiKey,
        openrouter_scoped_key_hash: hash,
        openrouter_scoped_key_funding_model: "self_funded",
      },
      { onConflict: "user_id" },
    );

    if (saveError) {
      // Don't leave a live, spend-enabled key orphaned on the user's account
      // when we failed to record it locally.
      await disableManagedOpenRouterKey(body.managementApiKey, hash).catch(() => {});
      throw saveError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not set up your OpenRouter managed key.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
