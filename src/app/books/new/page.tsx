import { Container } from "@mantine/core";
import { AppShell } from "@/components/layout/app-shell";
import { ImportManuscriptForm } from "@/components/books/import-manuscript-form";

export default function NewBookPage() {
  return (
    <AppShell>
      <Container size="lg">
        <ImportManuscriptForm />
      </Container>
    </AppShell>
  );
}
