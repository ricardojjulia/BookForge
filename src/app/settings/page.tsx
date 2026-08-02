import { Alert, Container } from "@mantine/core";
import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { SettingsPageClient } from "./settings-page-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container size="lg">
          <Alert color="yellow">Configure Supabase environment variables before saving settings.</Alert>
        </Container>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <AppShell>
        <Container size="lg">
          <Alert color="grape">Sign in to save LM Studio settings.</Alert>
        </Container>
      </AppShell>
    );
  }

  const { data } = await supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle();
  // llm_api_key is a write-only column (see the 202608010001 migration) —
  // it's always null on read. Never send the real key value to the client;
  // just tell the form whether one is already saved.
  const initial = data ? { ...data, llm_api_key: "" } : undefined;

  return (
    <AppShell>
      <Container size="lg">
        <SettingsPageClient userId={user.id} initial={initial} hasApiKey={Boolean(data?.llm_api_key_secret_id)} />
      </Container>
    </AppShell>
  );
}
