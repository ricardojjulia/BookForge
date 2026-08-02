"use client";

import { useState } from "react";
import { Button, Group, Modal, Paper, Select, SimpleGrid, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";

type BookOption = {
  id: string;
  title: string;
};

type Props = {
  bookCount: number;
  reportCount: number;
  aiEngine: string;
  books: BookOption[];
};

export function DashboardMetrics({ bookCount, reportCount, aiEngine, books }: Props) {
  const router = useRouter();
  const [criticChooserOpened, { open, close }] = useDisclosure(false);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  function openCriticReports() {
    if (!selectedBookId) return;
    close();
    router.push(`/books/${selectedBookId}#critic-reports`);
  }

  return (
    <>
      <SimpleGrid cols={{ base: 1, md: 3 }} mb="xl">
        <MetricLink label="Books" value={bookCount} href="#books" />
        <MetricButton label="Critic reports" value={reportCount} onClick={open} />
        <MetricLink label="AI engine" value={aiEngine} href="/settings" />
      </SimpleGrid>

      <Modal opened={criticChooserOpened} onClose={close} title="Choose a book" centered>
        <Select
          label="Book"
          placeholder={books.length ? "Select a book" : "No books available"}
          data={books.map((book) => ({ value: book.id, label: book.title }))}
          value={selectedBookId}
          onChange={setSelectedBookId}
          searchable
          disabled={!books.length}
        />
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={close}>Cancel</Button>
          <Button color="grape" disabled={!selectedBookId} onClick={openCriticReports}>View critic reports</Button>
        </Group>
      </Modal>
    </>
  );
}

function MetricLink({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Paper component="a" href={href} withBorder radius="md" p="lg" bg="white" style={metricStyle}>
      <MetricContent label={label} value={value} />
    </Paper>
  );
}

function MetricButton({ label, value, onClick }: { label: string; value: string | number; onClick: () => void }) {
  return (
    <Paper component="button" type="button" onClick={onClick} withBorder radius="md" p="lg" bg="white" style={metricStyle}>
      <MetricContent label={label} value={value} />
    </Paper>
  );
}

function MetricContent({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <Text size="sm" c="dimmed">{label}</Text>
      <Title order={2}>{value}</Title>
    </>
  );
}

const metricStyle = {
  color: "inherit",
  cursor: "pointer",
  textAlign: "left" as const,
  textDecoration: "none",
  width: "100%",
};
