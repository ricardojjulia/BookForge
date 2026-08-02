"use client";

import { useState } from "react";
import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { fetchJson } from "@/lib/http/fetch-json";
import { useRouter } from "next/navigation";
import { mergeMetadataSnapshotBody } from "@/lib/book-metadata/selection";

type Props = {
  bookId: string;
  summarized: number;
  chapterCount: number;
  hasBlueprint: boolean;
  criticDone: number;
  criticTotal: number;
  hasRewritePlan: boolean;
};

type CardAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  loading?: boolean;
};

export function ReadinessStatusGrid({ bookId, summarized, chapterCount, hasBlueprint, criticDone, criticTotal, hasRewritePlan }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const summariesReady = chapterCount > 0 && summarized === chapterCount;
  const criticReady = criticDone >= criticTotal;

  async function runTask(key: string, path: string, body?: unknown) {
    setRunning(key);
    setErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      if (path.endsWith("/rewrite-plan")) {
        const queued = await fetchJson<{ content?: { jobId?: string } }>(
          path,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              mergeMetadataSnapshotBody({ ...(body && typeof body === "object" ? body : {}), serverManaged: true }),
            ),
          },
          `${key}:queue`,
        );
        const jobId = queued.content?.jobId;
        if (!jobId) throw new Error("Rewrite plan queue handoff failed.");

        await fetchJson(
          path,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              mergeMetadataSnapshotBody({ ...(body && typeof body === "object" ? body : {}), jobId }),
            ),
          },
          `${key}:worker`,
        );
      } else {
        await fetchJson(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: body ? JSON.stringify(mergeMetadataSnapshotBody(body && typeof body === "object" ? (body as Record<string, unknown>) : {})) : undefined,
        }, key);
      }
      router.refresh();
    } catch (err) {
      setErrors((prev) => ({ ...prev, [key]: err instanceof Error ? err.message : "Failed." }));
    } finally {
      setRunning(null);
    }
  }

  const cards: Array<{
    key: string;
    label: string;
    value: string;
    ready: boolean;
    guidance: string;
    action: CardAction;
  }> = [
    {
      key: "summaries",
      label: "Chapter summaries generated",
      value: `${summarized}/${chapterCount}`,
      ready: summariesReady,
      guidance:
        "Whether every chapter has a summary at all. Existing summaries are separately checked for quality further down this page (Rewrite Readiness Gate) — a chapter can show ready here and still need a stronger summary there.",
      action: {
        label: "Summarize chapters",
        onClick: () => runTask("summaries", `/api/books/${bookId}/chapters/summarize`),
        loading: running === "summaries",
      },
    },
    {
      key: "blueprint",
      label: "Manuscript Blueprint",
      value: hasBlueprint ? "Ready" : "Missing",
      ready: hasBlueprint,
      guidance: "The Blueprint extracts characters, themes, and continuity rules used by every rewrite and Critic call.",
      action: {
        label: "Generate Blueprint",
        onClick: () => runTask("blueprint", `/api/books/${bookId}/analyze`),
        loading: running === "blueprint",
      },
    },
    {
      key: "critic",
      label: "Critic lenses",
      value: `${criticDone}/${criticTotal}`,
      ready: criticReady,
      guidance: `${criticDone === 0 ? "No lenses have run yet." : criticReady ? "" : `${criticTotal - criticDone} lens${criticTotal - criticDone === 1 ? "" : "es"} still missing.`} The plan is strongest when all ${criticTotal} have scored the manuscript.`,
      action: {
        label: criticDone === 0 ? "Run all critics" : "Run missing critics",
        onClick: () => runTask("critic", `/api/books/${bookId}/critic/all`, { stage: "baseline" }),
        loading: running === "critic",
      },
    },
    {
      key: "plan",
      label: "Rewrite plan",
      value: hasRewritePlan ? "Saved" : "Not generated",
      ready: hasRewritePlan,
      guidance: "Generate the plan once summaries and the Blueprint are ready. Critic coverage improves plan quality but is not required.",
      action: {
        label: "Go to Planning Gate",
        href: "#planning-gate",
      },
    },
  ];

  return (
    <Stack mb="xl">
      <SimpleGrid cols={{ base: 1, md: 4 }}>
        {cards.map((card) => (
          <Paper key={card.key} withBorder radius="md" p="lg" bg="white">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {card.label}
                </Text>
                <Badge color={card.ready ? "green" : "yellow"} variant="light">
                  {card.ready ? "ready" : "needs work"}
                </Badge>
              </Group>
              <Title order={2}>{card.value}</Title>
              {!card.ready && (
                <>
                  <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
                    {card.guidance}
                  </Text>
                  {card.action.href ? (
                    <Button
                      component="a"
                      href={card.action.href}
                      size="xs"
                      variant="light"
                      color="grape"
                      fullWidth
                    >
                      {card.action.label}
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      variant="light"
                      color="grape"
                      fullWidth
                      loading={card.action.loading}
                      disabled={running !== null && running !== card.key}
                      onClick={card.action.onClick}
                    >
                      {card.action.label}
                    </Button>
                  )}
                  {errors[card.key] && (
                    <Alert color="red" p="xs">
                      <Text size="xs">{errors[card.key]}</Text>
                    </Alert>
                  )}
                </>
              )}
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
