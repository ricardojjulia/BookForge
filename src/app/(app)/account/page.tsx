import { Alert, Container, Title } from "@mantine/core";
import { AccountPageClient } from "./account-page-client";
import { isManagedSaasDeployment } from "@/lib/deployment/mode";
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
    const [{ data: tiers }, { data: subscription }, { data: balance }] = await Promise.all([
      supabase.from("subscription_tiers").select("id,display_name,monthly_price_usd_cents").eq("is_active", true).order("sort_order"),
      supabase.from("user_subscriptions").select("tier_id,status").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_credit_balances").select("balance_usd_micros").eq("user_id", user.id).maybeSingle(),
    ]);
    billing = {
      tiers: tiers || [],
      currentTierId: subscription?.status === "active" ? subscription.tier_id : null,
      balanceUsdMicros: balance?.balance_usd_micros ?? null,
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
