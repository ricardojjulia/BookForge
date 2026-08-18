"use client";

import { useMemo, useState } from "react";
import { Alert, Badge, Button, Group, Modal, Paper, ScrollArea, Stack, Text, Textarea, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/books/manuscript-health-card";
import { fetchJson } from "@/lib/http/fetch-json";

type ChapterForLocks = {
  id: string;
  chapter_number: number;
  title: string | null;
};

type ParagraphForLocks = {
  id: string;
  chapter_id: string;
  paragraph_number: number;
  original_text: string;
  is_locked: boolean | null;
};

export function PassageLockManager({
  chapters,
  paragraphs,
}: {
  chapters: ChapterForLocks[];
  paragraphs: ParagraphForLocks[];
}) {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [splitParagraph, setSplitParagraph] = useState<ParagraphForLocks | null>(null);
  const [splitFirstText, setSplitFirstText] = useState("");
  const [splitSecondText, setSplitSecondText] = useState("");
  const [error, setError] = useState("");
  const paragraphsByChapter = useMemo(
    () =>
      paragraphs.reduce<Record<string, ParagraphForLocks[]>>((groups, paragraph) => {
        groups[paragraph.chapter_id] ||= [];
        groups[paragraph.chapter_id].push(paragraph);
        return groups;
      }, {}),
    [paragraphs],
  );
  const lockedCount = paragraphs.filter((paragraph) => paragraph.is_locked).length;

  async function toggleLock(paragraph: ParagraphForLocks) {
    const isLocked = Boolean(paragraph.is_locked);
    const reason = isLocked
      ? undefined
      : window.prompt("Why should this passage be protected from rewriting?", "Author wants this wording preserved.") || "";
    if (!isLocked && reason === "") return;

    setLoadingId(paragraph.id);
    setError("");
    try {
      await fetchJson(
        `/api/paragraphs/${paragraph.id}/lock`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locked: !isLocked, reason }),
        },
        isLocked ? "Unlock passage" : "Lock passage",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update passage lock.");
    } finally {
      setLoadingId(null);
    }
  }

  function openSplit(paragraph: ParagraphForLocks) {
    const midpoint = findSplitPoint(paragraph.original_text);
    setSplitParagraph(paragraph);
    setSplitFirstText(paragraph.original_text.slice(0, midpoint).trim());
    setSplitSecondText(paragraph.original_text.slice(midpoint).trim());
  }

  async function splitSelectedParagraph() {
    if (!splitParagraph) return;
    setLoadingId(`split:${splitParagraph.id}`);
    setError("");
    try {
      await fetchJson(
        `/api/paragraphs/${splitParagraph.id}/split`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ firstText: splitFirstText, secondText: splitSecondText }),
        },
        "Split paragraph",
      );
      setSplitParagraph(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to split paragraph.");
    } finally {
      setLoadingId(null);
    }
  }

  async function mergeWithNext(paragraph: ParagraphForLocks) {
    const confirmed = window.confirm("Merge this paragraph with the next paragraph in the same chapter?");
    if (!confirmed) return;
    setLoadingId(`merge:${paragraph.id}`);
    setError("");
    try {
      await fetchJson(
        `/api/paragraphs/${paragraph.id}/merge-next`,
        { method: "PATCH" },
        "Merge paragraphs",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to merge paragraphs.");
    } finally {
      setLoadingId(null);
    }
  }

  async function splitChapterAt(paragraph: ParagraphForLocks) {
    const chapter = chapters.find((item) => item.id === paragraph.chapter_id);
    const title =
      window.prompt(
        "Title for the new chapter",
        chapter ? `Chapter ${chapter.chapter_number + 1}` : "New chapter",
      ) || "";
    if (!title.trim()) return;

    const confirmed = window.confirm(
      "Create a new chapter starting at this paragraph? This will move this paragraph and all following paragraphs into the new chapter.",
    );
    if (!confirmed) return;

    setLoadingId(`chapter:${paragraph.id}`);
    setError("");
    try {
      await fetchJson(
        `/api/paragraphs/${paragraph.id}/split-chapter`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title }),
        },
        "Split chapter",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to split chapter.");
    } finally {
      setLoadingId(null);
    }
  }

  async function mergeChapterWithNext(chapter: ChapterForLocks) {
    const confirmed = window.confirm(
      `Merge "${chapter.title || `Chapter ${chapter.chapter_number}`}" with the next chapter? This moves paragraphs and scenes into the current chapter and renumbers the book.`,
    );
    if (!confirmed) return;

    setLoadingId(`merge-chapter:${chapter.id}`);
    setError("");
    try {
      await fetchJson(
        `/api/chapters/${chapter.id}/merge-next`,
        { method: "PATCH" },
        "Merge chapter",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to merge chapter.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <Button variant="outline" color="dark" onClick={open}>
            Manage Passage Locks
          </Button>
          <Pill label={`${lockedCount} LOCKED`} tone="neutral" />
        </Group>
        <Text size="sm" c="dimmed">
          Locked passages are skipped by rewrite batches and use original text by default during export.
        </Text>
      </Group>

      <Modal opened={opened} onClose={close} size="80rem" title="Manage Passage Locks" centered>
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <ScrollArea h="70vh">
            <Stack>
              {chapters.map((chapter) => {
                const chapterParagraphs = (paragraphsByChapter[chapter.id] || []).sort(
                  (a, b) => a.paragraph_number - b.paragraph_number,
                );
                if (!chapterParagraphs.length) return null;
                const chapterLocked = chapterParagraphs.filter((paragraph) => paragraph.is_locked).length;

                return (
                  <Paper key={chapter.id} withBorder radius="md" p="md" bg="#fbfaf8">
                    <Group justify="space-between" mb="sm">
                      <div>
                        <Title order={4}>
                          {chapter.chapter_number}. {chapter.title || "Untitled chapter"}
                        </Title>
                        <Text size="sm" c="dimmed">
                          {chapterLocked}/{chapterParagraphs.length} locked
                        </Text>
                      </div>
                      <Button
                        size="xs"
                        color="grape"
                        variant="light"
                        loading={loadingId === `merge-chapter:${chapter.id}`}
                        disabled={chapter.chapter_number === chapters.length}
                        onClick={() => mergeChapterWithNext(chapter)}
                      >
                        Merge chapter with next
                      </Button>
                    </Group>
                    <Stack>
                      {chapterParagraphs.map((paragraph) => (
                        <Paper key={paragraph.id} withBorder radius="sm" p="sm" bg="white">
                          <Group justify="space-between" align="flex-start">
                            <Stack gap={4} style={{ flex: 1 }}>
                              <Group gap="xs">
                                <Badge variant="light">Paragraph {paragraph.paragraph_number}</Badge>
                                {paragraph.is_locked && (
                                  <Badge color="gray" variant="light">
                                    Locked
                                  </Badge>
                                )}
                              </Group>
                              <Textarea value={paragraph.original_text} readOnly autosize minRows={2} maxRows={6} />
                            </Stack>
                            <Button
                              size="xs"
                              variant="light"
                              color={paragraph.is_locked ? "gray" : "dark"}
                              loading={loadingId === paragraph.id}
                              onClick={() => toggleLock(paragraph)}
                            >
                              {paragraph.is_locked ? "Unlock" : "Lock"}
                            </Button>
                            <Button
                              size="xs"
                              variant="subtle"
                              color="teal"
                              loading={loadingId === `split:${paragraph.id}`}
                              onClick={() => openSplit(paragraph)}
                            >
                              Split
                            </Button>
                            <Button
                              size="xs"
                              variant="subtle"
                              color="grape"
                              loading={loadingId === `merge:${paragraph.id}`}
                              onClick={() => mergeWithNext(paragraph)}
                            >
                              Merge next
                            </Button>
                            <Button
                              size="xs"
                              variant="subtle"
                              color="orange"
                              loading={loadingId === `chapter:${paragraph.id}`}
                              disabled={paragraph.paragraph_number === 1}
                              onClick={() => splitChapterAt(paragraph)}
                            >
                              Start new chapter here
                            </Button>
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea>
        </Stack>
      </Modal>
      <Modal
        opened={Boolean(splitParagraph)}
        onClose={() => setSplitParagraph(null)}
        title="Split Paragraph"
        size="xl"
        centered
      >
        <Stack>
          <Alert color="yellow">
            This updates the parsed manuscript structure. Original uploaded files and chapter source text remain stored.
          </Alert>
          <Textarea
            label="First paragraph"
            value={splitFirstText}
            onChange={(event) => setSplitFirstText(event.currentTarget.value)}
            autosize
            minRows={6}
          />
          <Textarea
            label="Second paragraph"
            value={splitSecondText}
            onChange={(event) => setSplitSecondText(event.currentTarget.value)}
            autosize
            minRows={6}
          />
          <Group justify="flex-end">
            <Button variant="subtle" color="dark" onClick={() => setSplitParagraph(null)}>
              Cancel
            </Button>
            <Button
              color="teal"
              loading={Boolean(splitParagraph && loadingId === `split:${splitParagraph.id}`)}
              disabled={!splitFirstText.trim() || !splitSecondText.trim()}
              onClick={splitSelectedParagraph}
            >
              Split Paragraph
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function findSplitPoint(text: string) {
  const midpoint = Math.floor(text.length / 2);
  const nextSentence = text.slice(midpoint).search(/[.!?]\s+/);
  if (nextSentence >= 0) return midpoint + nextSentence + 1;
  const nextSpace = text.indexOf(" ", midpoint);
  return nextSpace > 0 ? nextSpace : midpoint;
}
