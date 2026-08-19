"use client";

import { useState } from "react";
import { Button, Group, Modal, Select, Text, UnstyledButton } from "@mantine/core";
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
      <Group
        gap={28}
        style={{ padding: "20px 4px 28px", marginBottom: 8, borderBottom: "1px solid oklch(0.92 0.003 90)" }}
      >
        <MetricLink label="books" value={bookCount} href="#books" />
        <MetricButton label="critic reports" value={reportCount} onClick={open} />
        <MetricLink label="AI engine" value={aiEngine} href="/settings" />
      </Group>

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
    <UnstyledButton component="a" href={href} style={metricStyle}>
      <MetricContent label={label} value={value} />
    </UnstyledButton>
  );
}

function MetricButton({ label, value, onClick }: { label: string; value: string | number; onClick: () => void }) {
  return (
    <UnstyledButton onClick={onClick} style={metricStyle}>
      <MetricContent label={label} value={value} />
    </UnstyledButton>
  );
}

function MetricContent({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <Text component="span" style={{ fontSize: 20, fontWeight: 800, color: "oklch(0.2 0.005 90)" }}>{value}</Text>{" "}
      <Text component="span" style={{ fontSize: 13, color: "oklch(0.55 0.005 90)" }}>{label}</Text>
    </>
  );
}

const metricStyle = {
  color: "inherit",
  cursor: "pointer",
  textDecoration: "none",
};
