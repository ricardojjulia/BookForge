"use client";

import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconRocket, IconScissors, IconArrowUp } from "@tabler/icons-react";
import { AutoReviewRunner } from "./auto-review-runner";

type Mode = "full_review" | "make_shorter" | "make_longer";

type Props = { bookId: string; bookTitle: string };

const MODES: { value: Mode; icon: React.ReactNode; label: string; tagline: string; detail: string; color: string }[] = [
  {
    value: "full_review",
    icon: <IconRocket size={28} />,
    label: "Do it all for me!",
    tagline: "Full autonomous review cycle",
    detail:
      "Analyzes, critiques, rewrites, checks drift, and re-critiques. Loops until all 7 critics score ≥ 70 (up to 3 cycles). Then exports and marks the book finished.",
    color: "grape",
  },
  {
    value: "make_shorter",
    icon: <IconScissors size={28} />,
    label: "Make Shorter",
    tagline: "45–55% compression, then full review",
    detail:
      "Runs the same full cycle but the rewrite targets a 50% word-count reduction. Great for tightening first drafts or producing an abridged version.",
    color: "teal",
  },
  {
    value: "make_longer",
    icon: <IconArrowUp size={28} />,
    label: "Make Longer",
    tagline: "35–45% expansion, then full review",
    detail:
      "Expands prose depth by ~40%, then runs the full review cycle. Use this to develop a sparse draft into a fuller manuscript.",
    color: "blue",
  },
];

export function AutoReviewWizard({ bookId, bookTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Mode | null>(null);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  async function start() {
    if (!selected) return;
    const res = await fetch(`/api/books/${bookId}/auto-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: selected }),
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    setJobId(data.jobId);
    setRunning(true);
  }

  function reset() {
    setSelected(null);
    setRunning(false);
    setJobId(null);
    setOpen(false);
  }

  return (
    <>
      <Button
        color="grape"
        variant="gradient"
        gradient={{ from: "grape", to: "indigo" }}
        size="md"
        onClick={() => setOpen(true)}
      >
        Auto-Review Wizard
      </Button>

      <Modal
        opened={open}
        onClose={reset}
        title="Auto-Review Wizard"
        size={running ? "xl" : "lg"}
        centered
        closeOnClickOutside={!running}
        closeOnEscape={!running}
      >
        {running && jobId ? (
          <AutoReviewRunner
            bookId={bookId}
            bookTitle={bookTitle}
            jobId={jobId}
            mode={selected!}
            onDone={reset}
          />
        ) : (
          <Stack gap="md">
            <Text c="dimmed" size="sm">
              Choose a mode. BookForge will run the entire workflow — no further decisions needed —
              until the book is published.
            </Text>

            <Stack gap="sm">
              {MODES.map((mode) => (
                <Card
                  key={mode.value}
                  withBorder
                  radius="md"
                  p="md"
                  style={{
                    cursor: "pointer",
                    border: selected === mode.value ? `2px solid var(--mantine-color-${mode.color}-6)` : undefined,
                    background: selected === mode.value ? `var(--mantine-color-${mode.color}-0)` : undefined,
                  }}
                  onClick={() => setSelected(mode.value)}
                >
                  <Group wrap="nowrap" align="flex-start">
                    <Radio
                      value={mode.value}
                      checked={selected === mode.value}
                      onChange={() => setSelected(mode.value)}
                      color={mode.color}
                    />
                    <ThemeIcon color={mode.color} variant="light" size="xl" radius="md">
                      {mode.icon}
                    </ThemeIcon>
                    <Box style={{ flex: 1 }}>
                      <Group gap="xs" mb={2}>
                        <Text fw={700}>{mode.label}</Text>
                        <Badge color={mode.color} variant="light" size="sm">{mode.tagline}</Badge>
                      </Group>
                      <Text size="sm" c="dimmed">{mode.detail}</Text>
                    </Box>
                  </Group>
                </Card>
              ))}
            </Stack>

            <Group justify="flex-end" mt="sm">
              <Button variant="subtle" color="gray" onClick={reset}>Cancel</Button>
              <Button
                color="grape"
                disabled={!selected}
                onClick={start}
              >
                Start — I&apos;ll grab a coffee ☕
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
