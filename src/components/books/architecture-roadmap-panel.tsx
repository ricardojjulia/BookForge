"use client";

import { useState } from "react";
import { Badge, Box, Button, Collapse, Divider, Group, Paper, Stack, Text, Title } from "@mantine/core";
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

function ChapterRow({ chapter, status }: { chapter: ArchChapter; status: string }) {
  const [open, setOpen] = useState(false);
  const keyBeats = Array.isArray(chapter.keyBeats) ? chapter.keyBeats.map(toStr).filter(Boolean) : [];
  const targetWords = chapter.targetWords ?? (chapter.targetPages ? chapter.targetPages * 250 : null);

  return (
    <Box>
      <Group
        justify="space-between"
        align="flex-start"
        className={classes.chapterRow}
        onClick={() => setOpen((o) => !o)}
        py={6}
      >
        <Group align="flex-start" gap="sm" className={classes.chapterMeta}>
          <Text size="xs" c="dimmed" w={28} ta="right" mt={2}>
            {chapter.chapterNumber}
          </Text>
          <div className={classes.chapterMeta}>
            <Group gap="xs" mb={2}>
              <Text size="sm" fw={600}>
                {chapter.title || `Chapter ${chapter.chapterNumber}`}
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
              <Text size="xs" c="dimmed" lineClamp={open ? undefined : 2}>
                {chapter.purpose}
              </Text>
            )}
          </div>
        </Group>
        <Text size="xs" c="dimmed" mt={2}>
          {open ? "▲" : "▼"}
        </Text>
      </Group>

      <Collapse expanded={open}>
        <Box pl={40} pb={8}>
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
        </Box>
      </Collapse>
      <Divider opacity={0.3} />
    </Box>
  );
}

function PartSection({
  part,
  partIndex,
  dbChapters,
}: {
  part: ArchPart;
  partIndex: number;
  dbChapters: DbChapter[];
}) {
  const archChapters: ArchChapter[] = Array.isArray(part.chapters) ? part.chapters : [];
  const drafted = archChapters.filter((c) => chapterStatus(dbChapters, c.chapterNumber ?? 0) === "draft").length;

  return (
    <Box mb="md">
      <Group justify="space-between" mb={4}>
        <div>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Part {partIndex + 1}
          </Text>
          <Title order={5}>{part.title || `Part ${partIndex + 1}`}</Title>
          {part.purpose && (
            <Text size="xs" c="dimmed">
              {part.purpose}
            </Text>
          )}
        </div>
        <Badge variant="light" color={drafted === archChapters.length ? "green" : "yellow"}>
          {drafted}/{archChapters.length} chapters with draft prose
        </Badge>
      </Group>
      <Box>
        {archChapters.map((chapter, i) => (
          <ChapterRow
            key={chapter.chapterNumber ?? i}
            chapter={chapter}
            status={chapterStatus(dbChapters, chapter.chapterNumber ?? 0)}
          />
        ))}
      </Box>
    </Box>
  );
}

export function ArchitectureRoadmapPanel({
  architecture,
  chapters,
  plannedChapterCount,
}: {
  architecture: Record<string, unknown>;
  chapters: DbChapter[];
  plannedChapterCount: number;
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
            {draftedChapters} of {totalChapters} chapters have draft prose · click any chapter to expand key beats
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
            Generate {plannedChapterCount} remaining chapter{plannedChapterCount === 1 ? "" : "s"}
          </Button>
        )}
        {plannedChapterCount === 0 && (
          <Badge color="green" size="lg" variant="light">
            All chapters have draft prose
          </Badge>
        )}
      </Group>

      {plannedChapterCount === 0 && (
        <Paper withBorder radius="md" p="md" bg="#fff8e1" mb="md">
          <Group gap="sm" align="flex-start">
            <Text size="xl">→</Text>
            <div>
              <Text fw={700} size="sm">Next step: Run Auto-Review</Text>
              <Text size="sm" c="dimmed">
                All chapters now have draft prose. Auto-Review will read the full manuscript, run the critic panel, generate a Blueprint, and build a rewrite plan — all in one click. Find it in Studio Actions below, or use the button in the Production Command Center.
              </Text>
              <Group mt="xs">
                <Button component="a" href="#studio-actions" size="xs" color="orange">
                  Run Auto-Review
                </Button>
              </Group>
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

      <Stack gap="lg">
        {parts.map((part, i) => (
          <PartSection key={i} part={part} partIndex={i} dbChapters={chapters} />
        ))}
      </Stack>
    </Paper>
  );
}
