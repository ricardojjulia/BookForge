import { Container, Title } from "@mantine/core";
import { listStewardAccounts } from "@/lib/accounts/steward-directory";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { StewardAccountsClient } from "./accounts-client";

export const dynamic = "force-dynamic";

export default async function StewardAccountsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const initial = await listStewardAccounts(createAdminClient());

  return (
    <Container size="xl">
      <Title mb="lg">Accounts</Title>
      <StewardAccountsClient initialAccounts={initial.accounts} currentUserId={user?.id || ""} />
    </Container>
  );
}
