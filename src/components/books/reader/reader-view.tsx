"use client";

import { useState } from "react";
import { ActionIcon, Badge, Button, Group, Paper, Stack, Text, Textarea, Title } from "@mantine/core";
import { IconCheck, IconMessage, IconX } from "@tabler/icons-react";
import { fetchJson } from "@/lib/http/fetch-json";

type Chapter = { id: string; chapter_number: number; title: string | null };
type Paragraph = { id: string; chapter_id: string; paragraph_number: number; original_text: string | null; accepted_text: string | null };
type Annotation = { id: string; paragraph_id: string | null; note: string; resolved: boolean; created_at: string };

type Props = {
  bookId: string;
  chapters: Chapter[];
  paragraphs: Paragraph[];
  initialAnnotations: Annotation[];
};

export function ReaderView({ bookId, chapters, paragraphs, initialAnnotations }: Props) {
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState<string | null>(null);

  const byParagraph = annotations.reduce<Record<string, Annotation[]>>((acc, a) => {
    const key = a.paragraph_id || "general";
    acc[key] = [...(acc[key] || []), a];
    return acc;
  }, {});

  const paragraphsByChapter = paragraphs.reduce<Record<string, Paragraph[]>>((acc, p) => {
    acc[p.chapter_id] = [...(acc[p.chapter_id] || []), p];
    return acc;
  }, {});

  async function postAnnotation(paragraphId: string) {
    const note = drafts[paragraphId]?.trim();
    if (!note) return;
    setPosting(paragraphId);
    try {
      const res = await fetchJson<{ annotation: Annotation }>(`/api/books/${bookId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paragraphId, note }),
      });
      setAnnotations((prev) => [res.annotation, ...prev]);
      setDrafts((prev) => { const next = { ...prev }; delete next[paragraphId]; return next; });
    } finally {
      setPosting(null);
    }
  }

  async function resolve(annotationId: string) {
    await fetchJson(`/api/books/${bookId}/annotations/${annotationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
    setAnnotations((prev) => prev.map((a) => a.id === annotationId ? { ...a, resolved: true } : a));
  }

  return (
    <Stack gap="xl">
      {chapters.map((chapter) => (
        <Stack key={chapter.id} gap="md">
          <Title order={2} mt="xl">
            Chapter {chapter.chapter_number}{chapter.title ? `: ${chapter.title}` : ""}
          </Title>
          {(paragraphsByChapter[chapter.id] || []).map((para) => {
            const text = para.accepted_text || para.original_text || "";
            const paraAnnotations = byParagraph[para.id] || [];
            const isAnnotating = para.id in drafts;
            return (
              <Stack key={para.id} gap="xs">
                <Group align="flex-start" wrap="nowrap" gap="xs">
                  <Text style={{ flex: 1, lineHeight: 1.8 }}>{text}</Text>
                  <ActionIcon
                    size="sm"
                    variant={isAnnotating ? "filled" : "subtle"}
                    color="grape"
                    onClick={() => setDrafts((prev) =>
                      para.id in prev
                        ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== para.id))
                        : { ...prev, [para.id]: "" }
                    )}
                  >
                    <IconMessage size={14} />
                  </ActionIcon>
                </Group>

                {isAnnotating && (
                  <Paper withBorder radius="sm" p="sm" bg="#f8f7ff">
                    <Stack gap="xs">
                      <Textarea
                        placeholder="Your note on this paragraph…"
                        value={drafts[para.id]}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [para.id]: e.currentTarget.value }))}
                        autosize
                        minRows={2}
                        size="sm"
                      />
                      <Group gap="xs">
                        <Button size="xs" color="grape" loading={posting === para.id} onClick={() => postAnnotation(para.id)}>Add note</Button>
                        <Button size="xs" variant="subtle" color="gray" onClick={() => setDrafts((prev) => { const n = { ...prev }; delete n[para.id]; return n; })}>Cancel</Button>
                      </Group>
                    </Stack>
                  </Paper>
                )}

                {paraAnnotations.filter((a) => !a.resolved).map((a) => (
                  <Paper key={a.id} withBorder radius="sm" p="sm" bg="#fff9f0">
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap={2}>
                        <Badge size="xs" color="orange" variant="light">Reader note</Badge>
                        <Text size="sm">{a.note}</Text>
                        <Text size="xs" c="dimmed">{new Date(a.created_at).toLocaleString()}</Text>
                      </Stack>
                      <ActionIcon size="sm" variant="subtle" color="teal" onClick={() => resolve(a.id)} title="Mark resolved">
                        <IconCheck size={13} />
                      </ActionIcon>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            );
          })}
        </Stack>
      ))}
    </Stack>
  );
}
