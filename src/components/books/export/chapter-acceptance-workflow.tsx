"use client";

import { useState } from "react";
import { Alert, Badge, Button, Group, Paper, Progress, Stack, Table, Text, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";

export type ChapterFinalReadiness = {
  chapterId: string;
  chapterNumber: number;
  title: string | null;
  totalParagraphs: number;
  acceptedParagraphs: number;
  pendingDraftParagraphs: number;
  latestDraftParagraphs: number;
  lockedParagraphs: number;
};

export function ChapterAcceptanceWorkflow({ chapters }: { chapters: ChapterFinalReadiness[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function acceptChapter(chapter: ChapterFinalReadiness) {
    const confirmed = window.confirm(
      `Accept latest non-rejected drafts for ${chapter.chapterNumber}. ${chapter.title || "Untitled chapter"}? Locked passages will be skipped.`,
    );
    if (!confirmed) return;

    setLoadingId(chapter.chapterId);
    setMessage("");
    setError("");
    try {
      const result = await fetchJson<{ content?: { accepted?: number; skippedLocked?: number } }>(
        `/api/chapters/${chapter.chapterId}/accept-latest-revisions`,
        { method: "PATCH" },
        "Accept latest chapter revisions",
      );
      setMessage(
        `Accepted ${result.content?.accepted || 0} latest draft(s)${
          result.content?.skippedLocked ? `; skipped ${result.content.skippedLocked} locked passage(s)` : ""
        }.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to accept chapter drafts.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Stack>
        <div>
          <Title order={2}>Chapter Acceptance Workflow</Title>
          <Text c="dimmed" size="sm">
            Move chapters toward final assembly by accepting the latest draft for each paragraph after review.
          </Text>
        </div>
        {message && <Alert color="green">{message}</Alert>}
        {error && <Alert color="red">{error}</Alert>}
        <Table striped highlightOnHover>
          <thead>
            <tr>
              <th>Chapter</th>
              <th>Accepted</th>
              <th>Pending</th>
              <th>Locked</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {chapters.map((chapter) => {
              const acceptedPercent = chapter.totalParagraphs
                ? Math.round((chapter.acceptedParagraphs / chapter.totalParagraphs) * 100)
                : 0;
              const ready = chapter.totalParagraphs > 0 && acceptedPercent >= 90 && chapter.pendingDraftParagraphs === 0;
              return (
                <tr key={chapter.chapterId}>
                  <td>
                    <Text fw={700}>
                      {chapter.chapterNumber}. {chapter.title || "Untitled"}
                    </Text>
                    <Progress value={acceptedPercent} color={ready ? "green" : "grape"} radius="xl" size="sm" mt={6} />
                  </td>
                  <td>
                    {chapter.acceptedParagraphs}/{chapter.totalParagraphs}
                  </td>
                  <td>{chapter.pendingDraftParagraphs}</td>
                  <td>{chapter.lockedParagraphs}</td>
                  <td>
                    <Badge color={ready ? "green" : chapter.pendingDraftParagraphs ? "yellow" : "blue"} variant="light">
                      {ready ? "ready" : chapter.pendingDraftParagraphs ? "needs decisions" : "partial"}
                    </Badge>
                  </td>
                  <td>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        color="green"
                        variant="light"
                        disabled={!chapter.latestDraftParagraphs}
                        loading={loadingId === chapter.chapterId}
                        onClick={() => acceptChapter(chapter)}
                      >
                        Accept latest drafts
                      </Button>
                    </Group>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Stack>
    </Paper>
  );
}
