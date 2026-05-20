"use client";

import { useState } from "react";
import { Badge, Button, Group, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";

type Props = {
  bookId: string;
  exportId: string;
  isCurrentFinished: boolean;
};

export function MarkFinishedButton({ bookId, exportId, isCurrentFinished }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMark(targetExportId: string | null) {
    setLoading(true);
    setError(null);
    try {
      await fetchJson(`/api/books/${bookId}/mark-finished`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportId: targetExportId }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setLoading(false);
    }
  }

  if (isCurrentFinished) {
    return (
      <Group gap="xs">
        <Badge color="green" variant="filled" size="sm">
          Finished version
        </Badge>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          loading={loading}
          onClick={() => handleMark(null)}
        >
          Unmark
        </Button>
        {error && <Text size="xs" c="red">{error}</Text>}
      </Group>
    );
  }

  return (
    <Group gap="xs">
      <Button
        size="xs"
        variant="light"
        color="green"
        loading={loading}
        onClick={() => handleMark(exportId)}
      >
        Mark as finished version
      </Button>
      {error && <Text size="xs" c="red">{error}</Text>}
    </Group>
  );
}
