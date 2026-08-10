"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Box, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { fetchJson } from "@/lib/http/fetch-json";
import { WORDS_PER_PAGE } from "@/lib/manuscript/page-estimate";
import classes from "./architecture-roadmap-panel.module.css";

type ArchChapter = {
  chapterNumber?: number;
  title?: string;
  purpose?: string;
  targetWords?: number;
  targetPages?: number;
  emotionalMovement?: string;
  keyBeats?: unknown[];
  charactersOrConcepts?: unknown[];
  continuityNotes?: unknown[];
  riskNotes?: unknown[];
};

type ArchPart = {
  title?: string;
  purpose?: string;
  chapters?: ArchChapter[];
};

type DbChapter = {
  id: string;
  chapter_number: number;
  title: string | null;
  status: string | null;
  original_text: string | null;
};

function chapterStatus(dbChapters: DbChapter[], chapterNumber: number) {
  const db = dbChapters.find((c) => c.chapter_number === chapterNumber);
  if (!db) return "missing";
  if (
    db.status === "planned" ||
    /Draft text has not been generated yet/i.test(db.original_text || "")
  )
    return "planned";
  return db.status || "planned";
}

function statusColor(status: string) {
  if (status === "draft") return "blue";
  if (status === "planned") return "yellow";
  if (status === "missing") return "gray";
  return "teal";
}

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(toStr).join(", ");
  if (v && typeof v === "object")
    return Object.values(v as Record<string, unknown>).map(toStr).join(" · ");
  return "";
}

function chipBg(status: string) {
  if (status === "draft") return "var(--mantine-color-blue-1)";
  if (status === "planned") return "var(--mantine-color-yellow-1)";
  if (status === "missing") return "var(--mantine-color-gray-1)";
  return "var(--mantine-color-teal-1)";
}

function chipBorder(status: string) {
  if (status === "draft") return "var(--mantine-color-blue-4)";
  if (status === "planned") return "var(--mantine-color-yellow-5)";
  if (status === "missing") return "var(--mantine-color-gray-4)";
  return "var(--mantine-color-teal-4)";
}

function ChapterChip({
  chapter,
  status,
  selected,
  onClick,
}: {
  chapter: ArchChapter;
  status: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      title={chapter.title || `Chapter ${chapter.chapterNumber}`}
      className={classes.chapterChip}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 13,
        background: chipBg(status),
        border: `2px solid ${selected ? "var(--mantine-color-grape-6)" : chipBorder(status)}`,
      }}
    >
      {chapter.chapterNumber}
    </Box>
  );
}

function ChapterDetail({
  chapter,
  status,
  bookId,
  dbChapterId,
}: {
  chapter: ArchChapter;
  status: string;
  bookId: string;
  dbChapterId: string | null;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const keyBeats = Array.isArray(chapter.keyBeats) ? chapter.keyBeats.map(toStr).filter(Boolean) : [];
  const targetWords = chapter.targetWords ?? (chapter.targetPages ? chapter.targetPages * WORDS_PER_PAGE : null);

  async function generateThisChapter() {
    if (!dbChapterId) return;
    setGenerating(true);
    setError("");
    try {
      await fetchJson(
        `/api/books/${bookId}/generate-draft`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chapterId: dbChapterId }),
        },
        "Generate this chapter",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate this chapter.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Box mt="xs" p="sm" style={{ borderRadius: 8, background: "var(--mantine-color-body)" }}>
      <Group gap="xs" mb={4}>
        <Text size="sm" fw={600}>
          {chapter.chapterNumber}. {chapter.title || `Chapter ${chapter.chapterNumber}`}
        </Text>
        <Badge size="xs" color={statusColor(status)} variant="light">
          {status}
        </Badge>
        {targetWords && (
          <Text size="xs" c="dimmed">
            ~{targetWords.toLocaleString()} words
          </Text>
        )}
      </Group>
      {chapter.purpose && (
        <Text size="xs" c="dimmed" mb={4}>
          {chapter.purpose}
        </Text>
      )}
      {chapter.emotionalMovement && (
        <Text size="xs" mb={4}>
          <Text span fw={600}>Emotional arc: </Text>{chapter.emotionalMovement}
        </Text>
      )}
      {keyBeats.length > 0 && (
        <Box mb={4}>
          <Text size="xs" fw={600} mb={2}>Key beats</Text>
          <Stack gap={1}>
            {keyBeats.map((beat, i) => (
              <Text size="xs" key={i}>· {beat}</Text>
            ))}
          </Stack>
        </Box>
      )}
      {(status === "planned" || status === "missing") && dbChapterId && (
        <Box mt={6}>
          <Button size="compact-xs" variant="light" color="orange" loading={generating} onClick={generateThisChapter}>
            Generate this chapter
          </Button>
          {error && (
            <Alert color="red" p="xs" mt={4}>
              <Text size="xs">{error}</Text>
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}

function PartSection({
  part,
  partIndex,
  dbChapters,
  bookId,
}: {
  part: ArchPart;
  partIndex: number;
  dbChapters: DbChapter[];
  bookId: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const archChapters: ArchChapter[] = Array.isArray(part.chapters) ? part.chapters : [];
  const drafted = archChapters.filter((c) => chapterStatus(dbChapters, c.chapterNumber ?? 0) === "draft").length;
  const selectedChapter = selected != null ? archChapters[selected] : null;

  return (
    <Box mb="sm">
      <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Text size="xs" fw={700} c="dimmed" style={{ flexShrink: 0 }}>
            P{partIndex + 1}
          </Text>
          <Text size="sm" fw={600} truncate>
            {part.title || `Part ${partIndex + 1}`}
          </Text>
        </Group>
        <Badge size="xs" variant="light" color={drafted === archChapters.length ? "green" : "yellow"} style={{ flexShrink: 0 }}>
          {drafted}/{archChapters.length}
        </Badge>
      </Group>
      {part.purpose && (
        <Text size="xs" c="dimmed" lineClamp={1} mb={6}>
          {part.purpose}
        </Text>
      )}
      <Group gap={6}>
        {archChapters.map((chapter, i) => (
          <ChapterChip
            key={chapter.chapterNumber ?? i}
            chapter={chapter}
            status={chapterStatus(dbChapters, chapter.chapterNumber ?? 0)}
            selected={selected === i}
            onClick={() => setSelected((current) => (current === i ? null : i))}
          />
        ))}
      </Group>
      {selectedChapter && (
        <ChapterDetail
          chapter={selectedChapter}
          status={chapterStatus(dbChapters, selectedChapter.chapterNumber ?? 0)}
          bookId={bookId}
          dbChapterId={dbChapters.find((c) => c.chapter_number === selectedChapter.chapterNumber)?.id ?? null}
        />
      )}
    </Box>
  );
}

export function ArchitectureRoadmapPanel({
  bookId,
  architecture,
  chapters,
  plannedChapterCount,
  hasBlueprint,
}: {
  bookId: string;
  architecture: Record<string, unknown>;
  chapters: DbChapter[];
  plannedChapterCount: number;
  /** Blueprint is Auto-Review's first output -- once it exists, Auto-Review
   * has already run at least once, so "next step: run it" is stale. */
  hasBlueprint: boolean;
}) {
  const parts: ArchPart[] = Array.isArray(architecture.parts) ? (architecture.parts as ArchPart[]) : [];
  const totalChapters = parts.reduce((sum, p) => sum + (Array.isArray(p.chapters) ? p.chapters.length : 0), 0);
  const draftedChapters = totalChapters - plannedChapterCount;

  return (
    <Paper withBorder radius="md" p="xl" bg="#f8fff4" mb="xl">
      <Group justify="space-between" align="flex-start" mb="md">
        <div>
          <Title order={3}>Architecture Roadmap</Title>
          <Text c="dimmed" size="sm">
            {draftedChapters} of {totalChapters} chapters have draft prose · click a chapter number for details
          </Text>
          <Text c="dimmed" size="xs">
            Draft prose means the chapter text was generated. It is not yet final polish.
          </Text>
        </div>
        {plannedChapterCount > 0 && (
          <Button
            component="a"
            href="#studio-actions"
            color="orange"
            variant="filled"
          >
            Go to Generate {plannedChapterCount} remaining chapter{plannedChapterCount === 1 ? "" : "s"}
          </Button>
        )}
        {plannedChapterCount === 0 && (
          <Badge color="green" size="lg" variant="light">
            All chapters have draft prose
          </Badge>
        )}
      </Group>

      {plannedChapterCount === 0 && !hasBlueprint && (
        <Paper withBorder radius="md" p="md" bg="#fff8e1" mb="md">
          <Group gap="sm" align="flex-start">
            <Text size="xl">→</Text>
            <div>
              <Text fw={700} size="sm">Next step: Run Auto-Review</Text>
              <Text size="sm" c="dimmed">
                All chapters now have draft prose. Auto-Review will read the full manuscript, run the critic panel, generate a Blueprint, and build a rewrite plan — all in one click. Start it from the Auto-Review Wizard button in the Production Command Center above, or in Studio Actions below.
              </Text>
            </div>
          </Group>
        </Paper>
      )}

      {plannedChapterCount > 0 && (
        <Paper withBorder radius="md" p="md" bg="#fff3e0" mb="md">
          <Group gap="sm" align="flex-start">
            <Text size="xl">→</Text>
            <div>
              <Text fw={700} size="sm">Next step: Generate remaining chapters</Text>
              <Text size="sm" c="dimmed">
                {plannedChapterCount} chapter{plannedChapterCount === 1 ? "" : "s"} still need draft generation. In Studio Actions below, click <Text span fw={600}>Generate Planned Draft</Text>, then confirm the AI Task Preflight by clicking <Text span fw={600}>Proceed</Text>. You can generate up to 5 at a time.
              </Text>
            </div>
          </Group>
        </Paper>
      )}

      <Stack gap="md">
        {parts.map((part, i) => (
          <PartSection key={i} part={part} partIndex={i} dbChapters={chapters} bookId={bookId} />
        ))}
      </Stack>
    </Paper>
  );
}
