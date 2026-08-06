import { Alert, Container } from "@mantine/core";
import { CreativeWriterWorkspace } from "@/components/creativewriter/creativewriter-workspace";
import { getCreativeWriterWorkspaceData } from "@/lib/creativewriter-ui/dashboard";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function CreativeWriterPage({ searchParams }: { searchParams: Promise<{ bookId?: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <Container size="lg">
        <Alert color="yellow" title="Supabase environment is not configured">
          Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to use CreativeWriter.
        </Alert>
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
        <Alert color="grape" title="Login required">
          Sign in to open the CreativeWriter prototype.
        </Alert>
      </Container>
    );
  }

  const { bookId } = await searchParams;
  const workspace = await getCreativeWriterWorkspaceData({ supabase, accountId: user.id, selectedBookId: bookId }).catch((error: unknown) => {
    console.error("CreativeWriter workspace failed to load", error);
    return null;
  });

  if (!workspace) {
    return (
      <Container size="lg">
        <Alert color="red" title="CreativeWriter could not load">
          Refresh the page after checking the BookForge database connection and CreativeWriter migrations.
        </Alert>
      </Container>
    );
  }

  return (
    <CreativeWriterWorkspace initialData={workspace} />
  );
}
