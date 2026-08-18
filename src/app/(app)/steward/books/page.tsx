import { Container, Title } from "@mantine/core";
import { listStewardBooks } from "@/lib/accounts/steward-directory";
import { createAdminClient } from "@/lib/supabase/admin";
import { StewardBooksClient } from "./books-client";

export const dynamic = "force-dynamic";

export default async function StewardBooksPage() {
  const initial = await listStewardBooks(createAdminClient());

  return (
    <Container size="xl">
      <Title mb="lg">Books</Title>
      <StewardBooksClient initialBooks={initial.books} />
    </Container>
  );
}
