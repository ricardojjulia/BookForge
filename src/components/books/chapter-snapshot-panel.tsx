"use client";

import { useEffect, useState } from "react";
import { ActionIcon, Alert, Badge, Button, Group, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconCamera, IconClockRecord, IconTrash } from "@tabler/icons-react";
import { fetchJson } from "@/lib/http/fetch-json";

type Snapshot = { id: string; chapter_id: string; name: string; created_at: string };

type Props = {
  bookId: string;
  chapterId: string;
  chapterLabel: string;
};

export function ChapterSnapshotPanel({ bookId, chapterId, chapterLabel }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ snapshots: Snapshot[] }>(`/api/books/${bookId}/snapshots`)
      .then((d) => setSnapshots(d.snapshots.filter((s) => s.chapter_id === chapterId)))
      .catch(() => {});
  }, [bookId, chapterId]);

  async function takeSnapshot() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJson<{ snapshot: Snapshot }>(`/api/books/${bookId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, name: name.trim() }),
      });
      setSnapshots((prev) => [res.snapshot, ...prev]);
      setName("");
      setSuccess("Snapshot saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setLoading(false);
    }
  }

  async function restore(snapshotId: string, snapshotName: string) {
    if (!confirm(`Restore snapshot "${snapshotName}"? This will overwrite accepted text for all paragraphs in this chapter.`)) return;
    setRestoring(snapshotId);
    setError(null);
    try {
      const res = await fetchJson<{ restoredCount: number }>(`/api/books/${bookId}/snapshots/${snapshotId}`, { method: "POST" });
      setSuccess(`Restored ${res.restoredCount} paragraphs from "${snapshotName}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(null);
    }
  }

  async function remove(snapshotId: string) {
    setRestoring(snapshotId);
    try {
      await fetchJson(`/api/books/${bookId}/snapshots/${snapshotId}`, { method: "DELETE" });
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Paper withBorder radius="md" p="md" bg="#fafafa">
      <Stack gap="sm">
        <Title order={5}>Chapter Snapshots — {chapterLabel}</Title>
        <Text size="xs" c="dimmed">Checkpoint the current accepted text before a major rewrite. Restore in one click if things go wrong.</Text>

        <Group gap="xs" align="flex-end">
          <TextInput
            placeholder="Snapshot name (e.g. before-humanize-pass)"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            size="sm"
            style={{ flex: 1 }}
          />
          <Button
            size="sm"
            color="grape"
            leftSection={<IconCamera size={14} />}
            loading={loading}
            disabled={!name.trim()}
            onClick={takeSnapshot}
          >
            Save snapshot
          </Button>
        </Group>

        {error && <Alert color="red" variant="light" onClose={() => setError(null)} withCloseButton>{error}</Alert>}
        {success && <Alert color="teal" variant="light" onClose={() => setSuccess(null)} withCloseButton>{success}</Alert>}

        {snapshots.length === 0 && <Text size="sm" c="dimmed">No snapshots yet for this chapter.</Text>}

        {snapshots.map((s) => (
          <Paper key={s.id} withBorder radius="sm" p="sm">
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={2}>
                <Text size="sm" fw={500}>{s.name}</Text>
                <Badge size="xs" variant="light" color="gray">{new Date(s.created_at).toLocaleString()}</Badge>
              </Stack>
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="xs"
                  variant="light"
                  color="orange"
                  leftSection={<IconClockRecord size={13} />}
                  loading={restoring === s.id}
                  onClick={() => restore(s.id, s.name)}
                >
                  Restore
                </Button>
                <ActionIcon size="sm" variant="subtle" color="red" loading={restoring === s.id} onClick={() => remove(s.id)}>
                  <IconTrash size={13} />
                </ActionIcon>
              </Group>
            </Group>
          </Paper>
        ))}
      </Stack>
    </Paper>
  );
}
