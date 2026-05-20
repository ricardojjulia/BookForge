"use client";

import { useState } from "react";
import { Badge, Button, Group, Paper, Select, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { fetchJson } from "@/lib/http/fetch-json";

const NOTE_TYPE_LABELS: Record<string, string> = {
  character: "Character",
  timeline: "Timeline",
  world: "World-building",
  plot_thread: "Plot thread",
  other: "Other",
};

const NOTE_TYPE_COLORS: Record<string, string> = {
  character: "grape",
  timeline: "blue",
  world: "teal",
  plot_thread: "orange",
  other: "gray",
};

type SeriesNote = { id: string; series_id: string; note_type: string; title: string; content: string; created_at: string };
type Book = { id: string; title: string; series_order: number | null; status: string | null };

type Props = {
  seriesId: string;
  initialNotes: SeriesNote[];
  books: Book[];
};

export function SeriesBibleEditor({ seriesId, initialNotes, books }: Props) {
  const [notes, setNotes] = useState<SeriesNote[]>(initialNotes);
  const [newType, setNewType] = useState("character");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!newTitle.trim() || !newContent.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetchJson<{ note: SeriesNote }>(`/api/series/${seriesId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_type: newType, title: newTitle.trim(), content: newContent.trim() }),
      });
      setNotes((prev) => [res.note, ...prev]);
      setNewTitle("");
      setNewContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setCreating(false);
    }
  }

  async function remove(noteId: string) {
    setDeleting(noteId);
    try {
      await fetchJson(`/api/series/${seriesId}/notes/${noteId}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } finally {
      setDeleting(null);
    }
  }

  const grouped = notes.reduce<Record<string, SeriesNote[]>>((acc, n) => {
    acc[n.note_type] = [...(acc[n.note_type] || []), n];
    return acc;
  }, {});

  return (
    <Stack gap="xl">
      {books.length > 0 && (
        <Paper withBorder radius="md" p="lg" bg="white">
          <Title order={3} mb="sm">Books in this series</Title>
          <Stack gap="xs">
            {books.map((b) => (
              <Group key={b.id} justify="space-between">
                <Text size="sm">{b.series_order != null ? `#${b.series_order} — ` : ""}{b.title}</Text>
                <Badge size="xs" color={b.status === "finished" ? "green" : "gray"} variant="light">{b.status || "draft"}</Badge>
              </Group>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper withBorder radius="md" p="lg" bg="#f8f7ff">
        <Title order={4} mb="sm">Add series note</Title>
        <Stack gap="xs">
          <Select
            label="Type"
            value={newType}
            onChange={(v) => setNewType(v || "character")}
            data={Object.entries(NOTE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <TextInput label="Title" value={newTitle} onChange={(e) => setNewTitle(e.currentTarget.value)} required />
          <Textarea label="Content" value={newContent} onChange={(e) => setNewContent(e.currentTarget.value)} autosize minRows={3} required />
          {error && <Text c="red" size="sm">{error}</Text>}
          <Button
            leftSection={<IconPlus size={14} />}
            color="grape"
            loading={creating}
            disabled={!newTitle.trim() || !newContent.trim()}
            onClick={create}
            style={{ alignSelf: "flex-start" }}
          >
            Add note
          </Button>
        </Stack>
      </Paper>

      {Object.entries(grouped).map(([type, typeNotes]) => (
        <Stack key={type} gap="sm">
          <Title order={4}>
            <Badge color={NOTE_TYPE_COLORS[type] || "gray"} variant="light" size="lg" mr="xs">{NOTE_TYPE_LABELS[type] || type}</Badge>
            {typeNotes.length} note{typeNotes.length !== 1 ? "s" : ""}
          </Title>
          {typeNotes.map((note) => (
            <Paper key={note.id} withBorder radius="sm" p="md" bg="white">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4} style={{ flex: 1 }}>
                  <Text fw={600}>{note.title}</Text>
                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{note.content}</Text>
                </Stack>
                <Button size="xs" variant="subtle" color="red" loading={deleting === note.id} leftSection={<IconTrash size={12} />} onClick={() => remove(note.id)}>
                  Delete
                </Button>
              </Group>
            </Paper>
          ))}
        </Stack>
      ))}

      {notes.length === 0 && <Text c="dimmed">No series notes yet. Add characters, timeline events, world-building facts, or plot threads that span across books.</Text>}
    </Stack>
  );
}
