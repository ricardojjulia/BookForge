import { Alert, Container } from "@mantine/core";
import { CreateBookWizard } from "@/components/books/create-book-wizard";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CreateBookPage() {
  if (!hasSupabaseEnv()) {
    return (
      <Container size="xl">
        <Alert color="yellow">Configure Supabase before creating a book.</Alert>
      </Container>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Container size="xl">
        <Alert color="grape">Sign in to create a book.</Alert>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <CreateBookWizard />
    </Container>
  );
}
