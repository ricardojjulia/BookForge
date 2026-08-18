import { Container, Title } from "@mantine/core";
import { listStewardBooks } from "@/lib/accounts/steward-directory";
import { createAdminClient } from "@/lib/supabase/admin";
import { StewardBooksClient } from "./books-client";

export const dynamic = "force-dynamic";

export default async function StewardBooksPage({ searchParams }: { searchParams: Promise<{ ownerId?: string }> }) {
  const { ownerId } = await searchParams;
  const admin = createAdminClient();
  const initial = await listStewardBooks(admin, { ownerId });

  let ownerEmail: string | null = null;
  if (ownerId) {
    const { data } = await admin.auth.admin.getUserById(ownerId);
    ownerEmail = data?.user?.email || null;
  }

  return (
    <Container size="xl">
      <Title mb="lg">Books</Title>
      <StewardBooksClient initialBooks={initial.books} initialOwnerId={ownerId || null} initialOwnerEmail={ownerEmail} />
    </Container>
  );
}
