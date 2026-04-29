import { Alert, Container } from "@mantine/core";
import { ModelStatus } from "@/components/ai/model-status";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsForm } from "@/components/settings/settings-form";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

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
        <SettingsForm userId={user.id} initial={data || undefined} />
        <div style={{ marginTop: 24 }}>
          <ModelStatus />
        </div>
      </Container>
    </AppShell>
  );
}
