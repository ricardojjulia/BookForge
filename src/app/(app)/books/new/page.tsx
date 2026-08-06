import { Container } from "@mantine/core";
import { ImportManuscriptForm } from "@/components/books/import-manuscript-form";

export default function NewBookPage() {
  return (
    <Container size="lg">
      <ImportManuscriptForm />
    </Container>
  );
}
