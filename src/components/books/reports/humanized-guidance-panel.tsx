"use client";

import { useState } from "react";
import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import { GenerationProgressAlert } from "@/components/ai/generation-progress-alert";
import { fetchJson } from "@/lib/http/fetch-json";

type Report = {
  id: string;
  report_type: string;
  created_at: string;
  content: Record<string, unknown> | null;
};

export function HumanizedGuidancePanel({ bookId, reports }: { bookId: string; reports: Report[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const latest = reports.find((report) => report.report_type === "humanized_guidance");
  const content = latest?.content || null;
  const fit = (content?.modelFit && typeof content.modelFit === "object" ? content.modelFit : {}) as Record<string, unknown>;
  const fitScore = typeof fit.score === "number" ? fit.score : null;

  async function runHumanize() {
    setLoading(true);
    setError("");
    try {
      await fetchJson(
        `/api/books/${bookId}/humanize-guidance`,
        { method: "POST" },
        "Humanize guidance",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to humanize guidance.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Humanized Revision Guidance</Title>
            <Text c="dimmed">
              Turns Critic findings and drift warnings into clearer, author-friendly next steps.
            </Text>
          </div>
          <Group>
            {fitScore != null && (
              <Badge color={fitScore >= 80 ? "green" : fitScore >= 60 ? "yellow" : "red"} variant="light">
                model fit {fitScore}%
              </Badge>
            )}
            <Button color="grape" variant="light" loading={loading} onClick={runHumanize}>
              Humanize Guidance
            </Button>
          </Group>
        </Group>
        {error && <Alert color="red">{error}</Alert>}
        <GenerationProgressAlert
          active={loading}
          message="Generating humanized guidance..."
          detail="typically takes 20-40 seconds"
          estimatedSeconds={30}
          color="grape"
        />
        {!content ? (
          <Text c="dimmed">No humanized guidance yet. Run this after Critic or drift reports exist.</Text>
        ) : (
          <Stack>
            {stringValue(content.headline) && <Title order={3}>{stringValue(content.headline)}</Title>}
            <Text>{stringValue(content.authorFriendlySummary) || "No summary returned."}</Text>
            {stringValue(fit.warning) && <Alert color="yellow">{stringValue(fit.warning)}</Alert>}
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <ListCard title="Top priorities" items={arrayItems(content.topPriorities)} />
              <ListCard title="Humanized action plan" items={arrayItems(content.humanizedActionPlan)} />
              <ListCard title="Phrasing suggestions" items={arrayItems(content.phrasingSuggestions)} />
            </SimpleGrid>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function ListCard({ title, items }: { title: string; items: unknown[] }) {
  return (
    <Paper withBorder radius="md" p="md" bg="#fbfaf8">
      <Text fw={800} mb="xs">
        {title}
      </Text>
      {!items.length ? (
        <Text size="sm" c="dimmed">
          None returned.
        </Text>
      ) : (
        <Stack gap="xs">
          {items.slice(0, 6).map((item, index) => (
            <Text key={`${title}-${index}`} size="sm">
              {readableItem(item)}
            </Text>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

function readableItem(item: unknown) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return String(item);
  const record = item as Record<string, unknown>;
  return [
    stringValue(record.title),
    stringValue(record.whyItMatters),
    stringValue(record.whatToDoNext),
    stringValue(record.recommendation),
  ]
    .filter(Boolean)
    .join(" - ") || JSON.stringify(record);
}

function arrayItems(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
