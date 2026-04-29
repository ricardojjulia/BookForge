import { Container } from "@mantine/core";
import { CreateBookWizard } from "@/components/books/create-book-wizard";
import { AppShell } from "@/components/layout/app-shell";

export default function CreateBookPage() {
  return (
    <AppShell>
      <Container size="xl">
        <CreateBookWizard />
      </Container>
    </AppShell>
  );
}
