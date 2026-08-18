"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import { AiJobQueue, type AiJobQueueState } from "@/components/ai/ai-job-queue";
import { Pill } from "@/components/books/manuscript-health-card";
import { fetchJson } from "@/lib/http/fetch-json";
import { evaluateChapterSummaryQuality } from "@/lib/manuscript/summary-quality";

type ChapterForReview = {
  id: string;
  chapter_number: number;
  title: string | null;
  summary: string | null;
  original_text?: string | null;
};

export function ChapterSummaryReview({
  bookId,
  chapters,
}: {
  bookId: string;
  chapters: ChapterForReview[];
}) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<AiJobQueueState>({
    currentTask: "",
    currentUnit: "",
    totalUnits: 0,
    completedUnits: 0,
    successfulUnits: 0,
    failedUnits: 0,
    skippedUnits: 0,
    status: "idle",
  });

  const reviewed = useMemo(
    () =>
      chapters.map((chapter) => ({
        ...chapter,
        quality: evaluateChapterSummaryQuality({
          title: chapter.title,
          summary: chapter.summary,
          originalText: chapter.original_text,
        }),
      })),
    [chapters],
  );
  const weak = reviewed.filter((chapter) => chapter.quality.status === "review");
  const good = reviewed.length - weak.length;

  async function regenerateWeakSummaries() {
    const totalUnits = weak.length;
    if (!totalUnits) return;

    setLoading(true);
    setMessage("");
    setError("");
    const startedAt = Date.now();
    const estimatedSecondsPerCall = 28;
    setQueue({
      currentTask: "Regenerate weak chapter summaries",
      currentUnit: summaryQueueLabel(totalUnits),
      totalUnits,
      completedUnits: 0,
      successfulUnits: 0,
      failedUnits: 0,
      skippedUnits: 0,
      startedAt,
      estimatedSecondsPerCall,
      elapsedSeconds: 0,
      currentCallElapsedSeconds: 0,
      currentCallProgress: 0,
      nextCallSeconds: totalUnits > 1 ? estimatedSecondsPerCall : null,
      estimatedSecondsRemaining: null,
      estimatedProgress: true,
      status: "running",
    });

    try {
      const result = await fetchJson<{ content?: { summarized?: number } }>(
        `/api/books/${bookId}/chapters/summarize`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chapterIds: weak.map((chapter) => chapter.id) }),
        },
        "Regenerate weak summaries",
      );
      const summarized = result.content?.summarized ?? totalUnits;
      setMessage(`Regenerated ${summarized} weak chapter summary/summaries.`);
      setQueue((current) => ({
        ...current,
        currentUnit: "Complete",
        completedUnits: totalUnits,
        successfulUnits: summarized,
        failedUnits: Math.max(0, totalUnits - summarized),
        elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
        currentCallElapsedSeconds: estimatedSecondsPerCall,
        currentCallProgress: 1,
        nextCallSeconds: 0,
        estimatedSecondsRemaining: 0,
        estimatedProgress: false,
        status: "complete",
      }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to regenerate weak summaries.");
      setQueue((current) => ({
        ...current,
        failedUnits: Math.max(1, current.totalUnits - current.completedUnits),
        elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
        currentCallProgress: 0,
        nextCallSeconds: null,
        estimatedProgress: false,
        status: "cancelled",
      }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (queue.status !== "running" || !queue.startedAt || !queue.estimatedSecondsPerCall) {
      return;
    }

    const interval = window.setInterval(() => {
      setQueue((current) => {
        if (current.status !== "running" || !current.startedAt || !current.estimatedSecondsPerCall) {
          return current;
        }

        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000));
        const estimatedCompleted = Math.min(
          Math.max(0, current.totalUnits - 1),
          Math.floor(elapsedSeconds / current.estimatedSecondsPerCall),
        );
        const secondsIntoCurrentCall = elapsedSeconds % current.estimatedSecondsPerCall;
        const averageSecondsPerCall =
          estimatedCompleted >= 2
            ? Math.max(1, elapsedSeconds / estimatedCompleted)
            : current.estimatedSecondsPerCall;
        const remainingCalls = Math.max(0, current.totalUnits - estimatedCompleted);

        return {
          ...current,
          completedUnits: Math.max(current.completedUnits, estimatedCompleted),
          currentUnit: summaryQueueLabel(current.totalUnits, Math.min(current.totalUnits, estimatedCompleted + 1)),
          elapsedSeconds,
          currentCallElapsedSeconds: current.totalUnits <= 1 ? elapsedSeconds : secondsIntoCurrentCall,
          currentCallProgress:
            current.totalUnits <= 1
              ? Math.min(0.94, elapsedSeconds / current.estimatedSecondsPerCall)
              : Math.min(0.98, secondsIntoCurrentCall / current.estimatedSecondsPerCall),
          nextCallSeconds:
            current.totalUnits <= 1 || estimatedCompleted >= current.totalUnits - 1
              ? null
              : Math.max(0, Math.ceil(current.estimatedSecondsPerCall - secondsIntoCurrentCall)),
          estimatedSecondsRemaining:
            estimatedCompleted >= 2 ? Math.ceil(remainingCalls * averageSecondsPerCall) : null,
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [queue.estimatedSecondsPerCall, queue.startedAt, queue.status]);

  return (
    <Stack mb="md">
      <Group justify="space-between">
        <Group gap="xs">
          <Button variant="outline" color="grape" onClick={() => setOpened((current) => !current)}>
            {opened ? "Hide Summary Check" : "Check Summary Quality"}
          </Button>
          <Pill label={`${good}/${reviewed.length} USABLE`} tone={weak.length ? "warn" : "ok"} />
          {weak.length > 0 && <Pill label={`${weak.length} NEED REVIEW`} tone="warn" />}
        </Group>
        {opened && (
          <Button
            color="teal"
            disabled={!weak.length}
            loading={loading}
            onClick={regenerateWeakSummaries}
          >
            Regenerate Weak Summaries
          </Button>
        )}
      </Group>

      {opened && (
        <Paper withBorder radius="md" p="md" bg="#fbfaf8">
          <Stack>
            <div>
              <Title order={4}>Summary Quality Check</Title>
              <Text size="sm" c="dimmed">
                Flags summaries that are too short, generic, title-only, unfinished, or inconsistent with stored chapter text.
              </Text>
            </div>
            {message && <Alert color="green">{message}</Alert>}
            {error && <Alert color="red">{error}</Alert>}
            {queue.status !== "idle" && (
              <AiJobQueue
                job={queue}
                onPause={() => setQueue((current) => ({ ...current, status: "paused" }))}
                onResume={() => setQueue((current) => ({ ...current, status: "running" }))}
                onCancel={() => setQueue((current) => ({ ...current, status: "cancelled" }))}
                onRetryFailed={regenerateWeakSummaries}
              />
            )}
            {!weak.length ? (
              <Alert color="green">All saved summaries look usable.</Alert>
            ) : (
              <Table striped>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Chapter</th>
                    <th>Score</th>
                    <th>Why it needs review</th>
                  </tr>
                </thead>
                <tbody>
                  {weak.map((chapter) => (
                    <tr key={chapter.id}>
                      <td>{chapter.chapter_number}</td>
                      <td>{chapter.title || "Untitled"}</td>
                      <td>
                        <Badge color={chapter.quality.score < 45 ? "red" : "yellow"} variant="light">
                          {chapter.quality.score}
                        </Badge>
                      </td>
                      <td>
                        <Text size="sm">{chapter.quality.reasons.join(" ")}</Text>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

function summaryQueueLabel(totalUnits: number, current = 1) {
  if (totalUnits <= 1) return "Queued chapter summary 1 of 1";
  return `Queued chapter summary ${current} of ${totalUnits}`;
}
