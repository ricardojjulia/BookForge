"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Group, Loader, Paper, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";

type ChapterStat = {
  chapterId: string;
  chapterNumber: number;
  title: string | null;
  paragraphCount: number;
  acceptedParagraphs: number;
  acceptedPercent: number;
  originalWords: number;
  acceptedWords: number;
  wordDelta: number;
  pendingParagraphs: number;
  pendingVersions: number;
  uncoveredParagraphs: number;
};

type Stats = {
  totalOriginalWords: number;
  totalAcceptedWords: number;
  wordDelta: number;
  totalVersions: number;
  acceptedVersions: number;
  rejectedVersions: number;
  pendingVersions: number;
  acceptanceRate: number;
  modeBreakdown: Record<string, number>;
  chapterStats: ChapterStat[];
};

type Props = { bookId: string };

export function RevisionStatsPanel({ bookId }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/books/${bookId}/stats`)
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, [bookId]);

  if (loading) return <Paper withBorder radius="md" p="xl" bg="white"><Loader size="sm" /></Paper>;
  if (!stats) return null;

  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Title order={2} mb="lg">Revision Statistics</Title>

      <SimpleGrid cols={{ base: 2, md: 4 }} mb="xl">
        <StatCard label="Original words" value={stats.totalOriginalWords.toLocaleString()} />
        <StatCard label="Current words" value={stats.totalAcceptedWords.toLocaleString()} />
        <StatCard label="Word delta" value={(stats.wordDelta >= 0 ? "+" : "") + stats.wordDelta.toLocaleString()} color={stats.wordDelta > 0 ? "teal" : stats.wordDelta < 0 ? "red" : "gray"} />
        <StatCard label="Acceptance rate" value={`${stats.acceptanceRate}%`} color={stats.acceptanceRate >= 70 ? "green" : stats.acceptanceRate >= 40 ? "yellow" : "red"} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 2, md: 4 }} mb="xl">
        <StatCard label="Total revisions" value={stats.totalVersions.toLocaleString()} />
        <StatCard label="Accepted" value={stats.acceptedVersions.toLocaleString()} color="green" />
        <StatCard label="Rejected" value={stats.rejectedVersions.toLocaleString()} color="red" />
        <StatCard label="Pending" value={stats.pendingVersions.toLocaleString()} color="yellow" />
      </SimpleGrid>

      <Alert color="blue" variant="light" mb="xl">
        Accepted % is coverage (paragraphs with accepted text), not pending queue workload. A chapter can be below
        100% and still have no pending review decisions.
      </Alert>

      {Object.keys(stats.modeBreakdown).length > 0 && (
        <Stack gap="xs" mb="xl">
          <Text size="sm" fw={500}>Revisions by mode</Text>
          <Group gap="xs">
            {Object.entries(stats.modeBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([mode, count]) => (
                <Badge key={mode} color="grape" variant="light">{mode}: {count}</Badge>
              ))}
          </Group>
        </Stack>
      )}

      {stats.chapterStats.length > 0 && (
        <>
          <Text size="sm" fw={500} mb="xs">Per-chapter breakdown</Text>
          <Table striped highlightOnHover>
            <thead>
              <tr>
                <th>Chapter</th>
                <th>Accepted</th>
                <th>Orig. words</th>
                <th>Current words</th>
                <th>Delta</th>
                <th>Action needed</th>
              </tr>
            </thead>
            <tbody>
              {stats.chapterStats.map((c) => (
                <tr key={c.chapterId}>
                  <td>{c.chapterNumber}{c.title ? ` — ${c.title}` : ""}</td>
                  <td>
                    <Badge color={c.acceptedPercent >= 90 ? "green" : c.acceptedPercent >= 50 ? "yellow" : "gray"} variant="light" size="sm">
                      {c.acceptedPercent}%
                    </Badge>
                  </td>
                  <td>{c.originalWords.toLocaleString()}</td>
                  <td>{c.acceptedWords.toLocaleString()}</td>
                  <td>
                    <Text size="sm" c={c.wordDelta > 0 ? "teal" : c.wordDelta < 0 ? "red" : "dimmed"}>
                      {c.wordDelta >= 0 ? "+" : ""}{c.wordDelta}
                    </Text>
                  </td>
                  <td>
                    {c.pendingParagraphs > 0 ? (
                      <Badge color="yellow" variant="light" size="sm">
                        {c.pendingParagraphs} paragraph(s) need review ({c.pendingVersions} draft version(s))
                      </Badge>
                    ) : c.uncoveredParagraphs > 0 ? (
                      <Badge color="blue" variant="light" size="sm">
                        No pending decisions. {c.uncoveredParagraphs} paragraph(s) still on original text.
                      </Badge>
                    ) : (
                      <Badge color="green" variant="light" size="sm">
                        Fully accepted
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </Paper>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Paper withBorder radius="sm" p="md" bg="white">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={900} c={color}>{value}</Text>
    </Paper>
  );
}
