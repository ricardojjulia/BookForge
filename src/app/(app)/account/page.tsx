import { Alert, Container, Title } from "@mantine/core";
import { AccountPageClient } from "./account-page-client";
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

  return (
    <Container size="sm">
      <Title mb="xl">Account</Title>
      <AccountPageClient
        email={user.email ?? ""}
        displayName={profile?.display_name ?? ""}
      />
    </Container>
  );
}
