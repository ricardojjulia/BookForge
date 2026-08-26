import { Alert, Container, Title } from "@mantine/core";
import { AccountPageClient } from "./account-page-client";
import { isManagedSaasDeployment } from "@/lib/deployment/mode";
import { getManagedOpenRouterKeyUsage } from "@/lib/openrouter/management";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  if (!hasSupabaseEnv()) {
    return (
      <Container size="sm">
        <Alert color="yellow">Configure Supabase before managing your account.</Alert>
      </Container>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Container size="sm">
        <Alert color="grape">Sign in to manage your account.</Alert>
      </Container>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const managedSaas = isManagedSaasDeployment();
  let billing = null;
  if (managedSaas) {
    const [{ data: tiers }, { data: subscription }, { data: balance }, { data: settings }] = await Promise.all([
      supabase.from("subscription_tiers").select("id,display_name,monthly_price_usd_cents").eq("is_active", true).order("sort_order"),
      supabase.from("user_subscriptions").select("tier_id,status,trial_ends_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_credit_balances").select("balance_usd_micros").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_settings").select("openrouter_scoped_key_hash").eq("user_id", user.id).maybeSingle(),
    ]);
    const isTrialing = subscription?.status === "trialing";
    const trialEndsAt = subscription?.trial_ends_at ?? null;
    // Server component, route is force-dynamic -- computed fresh per request, not during a render pass.
    // eslint-disable-next-line react-hooks/purity
    const trialActive = isTrialing && !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now();

    // If this user is on the BookForge-managed OpenRouter path, the scoped
    // key's own live balance is the authoritative number -- balanceUsdMicros
    // above is cosmetic for them (see src/lib/lmstudio/client.ts, which skips
    // the internal reservation for these users). Best-effort only: a failed
    // lookup here must not break the account page.
    let openRouterUsage: { limitUsd: number | null; usageUsd: number; limitRemainingUsd: number | null; disabled: boolean } | null = null;
    if (settings?.openrouter_scoped_key_hash) {
      try {
        const managementKey = (await supabase.rpc("get_openrouter_management_key", { p_user_id: user.id })).data as string | null;
        if (managementKey) {
          const usage = await getManagedOpenRouterKeyUsage(managementKey, settings.openrouter_scoped_key_hash);
          openRouterUsage = {
            limitUsd: usage.limit,
            usageUsd: usage.usage,
            limitRemainingUsd: usage.limitRemaining,
            disabled: usage.disabled,
          };
        }
      } catch {
        // Best-effort -- the internal balance line above still renders.
      }
    }

    billing = {
      tiers: tiers || [],
      currentTierId: subscription?.status === "active" ? subscription.tier_id : null,
      balanceUsdMicros: balance?.balance_usd_micros ?? null,
      trial: isTrialing ? { active: trialActive, endsAt: trialEndsAt, tierId: subscription?.tier_id ?? null } : null,
      openRouterUsage,
    };
  }

  return (
    <Container size="sm">
      <Title mb="xl">Account</Title>
      <AccountPageClient
        email={user.email ?? ""}
        displayName={profile?.display_name ?? ""}
        billing={billing}
      />
    </Container>
  );
}
