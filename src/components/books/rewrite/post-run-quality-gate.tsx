"use client";

import { useMemo, useState } from "react";
import { Alert, Badge, Button, Group, Paper, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criticLenses } from "@/lib/critic/prompts";
import { summarizeStrategyOutcome } from "@/lib/critic/comparison";
import { fetchJson } from "@/lib/http/fetch-json";

type ReportRow = {
  id: string;
  report_type: string;
  created_at: string;
  content: Record<string, unknown> | null;
};

type LatestRewriteJob = {
  id: string;
  status: string | null;
  created_at: string;
  completed_at: string | null;
  settings: Record<string, unknown> | null;
} | null;

export function PostRunQualityGate({
  bookId,
  reports,
  latestRewriteJob,
  acceptedParagraphs,
  totalParagraphs,
}: {
  bookId: string;
  reports: ReportRow[];
  latestRewriteJob: LatestRewriteJob;
  acceptedParagraphs: number;
  totalParagraphs: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const outcome = useMemo(() => summarizeStrategyOutcome(reports), [reports]);
  const latestDrift = reports.find((report) => report.report_type === "rewrite_drift_check");
  const latestGuidance = reports.find((report) => report.report_type === "humanized_guidance");
  const postCriticCount = reports.filter((report) => report.report_type.startsWith("critic_post:")).length;
  const acceptedPercent = totalParagraphs ? Math.round((acceptedParagraphs / totalParagraphs) * 100) : 0;
  const hasCompletedRewrite = latestRewriteJob?.status === "completed";
  const missingChecks = [
    !latestDrift ? "drift check" : "",
    postCriticCount < 7 ? "post-rewrite Critic" : "",
    !latestGuidance ? "humanized guidance" : "",
  ].filter(Boolean);

  async function runAction(action: "drift" | "critic" | "guidance") {
    setLoading(action);
    setMessage("");
    setError("");
    try {
      if (action === "drift") {
        await fetchJson(
          `/api/books/${bookId}/drift-check`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ revisionJobId: latestRewriteJob?.id }),
          },
          "Run drift check",
        );
        setMessage("Drift check saved.");
      } else if (action === "critic") {
        const result = await fetchJson<{ content?: { completed?: number } }>(
          `/api/books/${bookId}/critic/all`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ stage: "post_rewrite" }),
          },
          "Run post-rewrite Critic",
        );
        setMessage(`Post-rewrite Critic saved ${result.content?.completed || 0} lens report(s).`);
      } else {
        await fetchJson(`/api/books/${bookId}/humanize-guidance`, { method: "POST" }, "Run humanized guidance");
        setMessage("Humanized guidance saved.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quality gate action failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Post-Run Quality Gate</Title>
            <Text c="dimmed">
              After a rewrite batch, verify drift, compare Critic scores, and decide whether to continue, adjust, or reset.
            </Text>
          </div>
          <Badge color={hasCompletedRewrite ? "green" : "gray"} variant="light">
            {hasCompletedRewrite ? "Rewrite completed" : "No completed rewrite yet"}
          </Badge>
        </Group>

        <div>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={700}>
              Accepted rewrite coverage
            </Text>
            <Text size="sm" c="dimmed">
              {acceptedPercent}%
            </Text>
          </Group>
          <Progress value={acceptedPercent} color={acceptedPercent >= 80 ? "green" : "yellow"} radius="xl" />
        </div>

        {missingChecks.length > 0 ? (
          <Alert color="yellow">Missing checks: {missingChecks.join(", ")}.</Alert>
        ) : (
          <Alert color="green">All post-run checks are available for this rewrite state.</Alert>
        )}
        {message && <Alert color="green">{message}</Alert>}
        {error && <Alert color="red">{error}</Alert>}

        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <QualityAction
            title="Drift check"
            status={latestDrift ? "Done" : "Missing"}
            description="Checks voice, fact, timeline, motif, character, and worldview drift against rewrite samples."
            loading={loading === "drift"}
            disabled={!latestRewriteJob}
            onClick={() => runAction("drift")}
          />
          <QualityAction
            title="Post-rewrite Critic"
            status={`${postCriticCount}/7 lenses`}
            description="Reruns every BookForge Critic lens against accepted rewrite context."
            loading={loading === "critic"}
            disabled={!hasCompletedRewrite}
            onClick={() => runAction("critic")}
          />
          <QualityAction
            title="Humanized guidance"
            status={latestGuidance ? "Done" : "Missing"}
            description="Turns Critic and drift findings into author-friendly next actions."
            loading={loading === "guidance"}
            disabled={!reports.length}
            onClick={() => runAction("guidance")}
          />
        </SimpleGrid>

        <Paper withBorder radius="md" p="md" bg="#fbfaf8">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text fw={900}>Strategy Outcome Summary</Text>
              <Text size="sm" c="dimmed">
                {outcome.recommendation}
              </Text>
            </div>
            <Badge color={outcome.averageDelta == null ? "gray" : outcome.averageDelta >= 0 ? "green" : "red"} variant="light">
              Avg delta {outcome.averageDelta == null ? "--" : `${outcome.averageDelta >= 0 ? "+" : ""}${outcome.averageDelta}`}
            </Badge>
          </Group>

          <SimpleGrid cols={{ base: 1, md: 2 }} mt="md">
            <OutcomeList title="Top improvements" items={outcome.improvements.slice(0, 3)} positive />
            <OutcomeList title="Regressions" items={outcome.regressions.slice(0, 3)} />
          </SimpleGrid>
        </Paper>

        <Group>
          <Button component={Link} href={`/books/${bookId}/revisions?job=${latestRewriteJob?.id || "latest"}`} variant="light" color="teal" disabled={!latestRewriteJob}>
            Review sample batch
          </Button>
          <Button component={Link} href={`/books/${bookId}/rewrite-plan`} variant="light" color="grape">
            Adjust strategy
          </Button>
          <Button component={Link} href={`/books/${bookId}/final-manuscript`} variant="light" color="green">
            Export accepted manuscript
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function QualityAction({
  title,
  status,
  description,
  loading,
  disabled,
  onClick,
}: {
  title: string;
  status: string;
  description: string;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Paper withBorder radius="md" p="md" bg="#fbfaf8">
      <Stack>
        <Group justify="space-between">
          <Text fw={900}>{title}</Text>
          <Badge color={status.includes("Missing") ? "yellow" : "teal"} variant="light">
            {status}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
        <Button variant="light" color="grape" loading={loading} disabled={disabled} onClick={onClick}>
          Run
        </Button>
      </Stack>
    </Paper>
  );
}

function OutcomeList({
  title,
  items,
  positive = false,
}: {
  title: string;
  items: Array<{ lens: keyof typeof criticLenses; delta: number | null }>;
  positive?: boolean;
}) {
  return (
    <Paper withBorder radius="sm" p="sm" bg="white">
      <Text fw={800} mb="xs">
        {title}
      </Text>
      {!items.length ? (
        <Text size="sm" c="dimmed">
          Not enough before/after data yet.
        </Text>
      ) : (
        <Stack gap={4}>
          {items.map((item) => (
            <Group key={item.lens} justify="space-between">
              <Text size="sm">{criticLenses[item.lens].label}</Text>
              <Badge color={positive ? "green" : "red"} variant="light">
                {Number(item.delta) >= 0 ? "+" : ""}
                {item.delta}
              </Badge>
            </Group>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
