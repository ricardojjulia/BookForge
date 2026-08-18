"use client";

import { Alert, Button, Group, Modal, Stack, Text, Textarea, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ChapterSummaryViewer({
  chapterId,
  chapterNumber,
  title,
  summary,
}: {
  chapterId: string;
  chapterNumber: number;
  title: string | null;
  summary: string | null;
}) {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasSummary = Boolean(summary?.trim());

  async function eraseSummary() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/chapters/${chapterId}/summary`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to erase summary.");
      router.refresh();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to erase summary.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: hasSummary ? "oklch(0.5 0.16 275)" : "oklch(0.6 0.005 90)",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {hasSummary ? "View Summary →" : "No Summary"}
      </button>
      <Modal opened={opened} onClose={close} size="xl" title="Chapter Summary" centered>
        <Stack>
          <div>
            <Title order={3}>{displayTitle(chapterNumber, title)}</Title>
            <Text size="sm" c="dimmed">
              Revision context generated for this chapter.
            </Text>
          </div>
          <Textarea
            value={summary || "No summary has been generated yet."}
            readOnly
            autosize
            minRows={12}
            maxRows={24}
            styles={{
              input: {
                fontFamily:
                  'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
                lineHeight: 1.65,
              },
            }}
          />
          {error && <Alert color="red">{error}</Alert>}
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Erasing this summary will mark the chapter as needing review.
            </Text>
            <Button color="red" variant="light" disabled={!hasSummary} loading={loading} onClick={eraseSummary}>
              Erase Summary
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function displayTitle(chapterNumber: number, title: string | null) {
  const cleanTitle = title?.trim();
  if (!cleanTitle) return `Chapter ${chapterNumber}`;
  if (/^(chapter|cap[ií]tulo)\s+\w+/i.test(cleanTitle)) return cleanTitle;
  return `Chapter ${chapterNumber}: ${cleanTitle}`;
}
