import { Alert, Container } from "@mantine/core";
import { CreateBookWizard } from "@/components/books/create-book-wizard";
import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CreateBookPage() {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell>
        <Container size="xl">
          <Alert color="yellow">Configure Supabase before creating a book.</Alert>
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
        <Container size="xl">
          <Alert color="grape">Sign in to create a book.</Alert>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container size="xl">
        <CreateBookWizard />
      </Container>
    </AppShell>
  );
}
