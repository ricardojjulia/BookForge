import { Container } from "@mantine/core";
import { CreateBookWizard } from "@/components/books/create-book-wizard";

export default function CreateBookPage() {
  return (
    <Container size="xl">
      <CreateBookWizard />
    </Container>
  );
}
