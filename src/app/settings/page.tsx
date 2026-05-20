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

  return (
    <AppShell>
      <Container size="lg">
        <SettingsPageClient userId={user.id} initial={data || undefined} />
      </Container>
    </AppShell>
  );
}
