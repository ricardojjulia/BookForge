import { Alert, Container } from "@mantine/core";
import { ImportManuscriptForm } from "@/components/books/import-manuscript-form";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewBookPage() {
  if (!hasSupabaseEnv()) {
    return (
      <Container size="lg">
        <Alert color="yellow">Configure Supabase before importing a manuscript.</Alert>
      </Container>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Container size="lg">
        <Alert color="grape">Sign in to import a manuscript.</Alert>
      </Container>
    );
  }

  return (
    <Container size="lg">
      <ImportManuscriptForm />
    </Container>
  );
}
