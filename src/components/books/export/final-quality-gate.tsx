"use client";

import { useMemo, useState } from "react";
import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import { criticLenses } from "@/lib/critic/prompts";
import { buildCriticComparisons, summarizeStrategyOutcome } from "@/lib/critic/comparison";
import { fetchJson } from "@/lib/http/fetch-json";
import { mergeMetadataSnapshotBody } from "@/lib/book-metadata/selection";

type CriticReport = {
  report_type: string;
  content: Record<string, unknown> | null;
  created_at: string;
};

export function FinalQualityGate({
  bookId,
  reports,
  latestRewriteJobId,
  acceptedPercent,
}: {
  bookId: string;
  reports: CriticReport[];
  latestRewriteJobId: string | null;
  acceptedPercent: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const comparisons = useMemo(() => buildCriticComparisons(reports), [reports]);
  const outcome = useMemo(() => summarizeStrategyOutcome(reports), [reports]);
  const postCriticCount = comparisons.filter((comparison) => typeof comparison.after === "number").length;
  const latestDrift = reports.find((report) => report.report_type === "rewrite_drift_check");
  const latestGuidance = reports.find((report) => report.report_type === "humanized_guidance");
  const regressions = comparisons.filter((comparison) => typeof comparison.delta === "number" && comparison.delta < 0);
  const finalStatus = getFinalQualityStatus({
    acceptedPercent,
    postCriticCount,
    driftRisk: stringValue(latestDrift?.content?.overallDriftRisk),
    regressionCount: regressions.length,
  });

  async function runAction(action: "critic" | "drift" | "guidance") {
    setLoading(action);
    setMessage("");
    setError("");
    try {
      if (action === "critic") {
        const result = await fetchJson<{ content?: { completed?: number } }>(
          `/api/books/${bookId}/critic/all`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(mergeMetadataSnapshotBody({ stage: "post_rewrite" })),
          },
          "Run post-rewrite Critic",
        );
        setMessage(`Post-rewrite Critic completed ${result.content?.completed || 0} lens evaluation(s).`);
      }
      if (action === "drift") {
        const queued = await fetchJson<{ content?: { jobId?: string } }>(
          `/api/books/${bookId}/drift-check`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              mergeMetadataSnapshotBody({ revisionJobId: latestRewriteJobId || undefined, serverManaged: true }),
            ),
          },
          "Queue final drift check",
        );
        const jobId = queued.content?.jobId;
        if (!jobId) throw new Error("Final drift check queue handoff failed.");

        await fetchJson(
          `/api/books/${bookId}/drift-check`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(mergeMetadataSnapshotBody({ revisionJobId: latestRewriteJobId || undefined, jobId })),
          },
          "Run final drift check worker",
        );
        setMessage("Final drift check saved.");
      }
      if (action === "guidance") {
        await fetchJson(`/api/books/${bookId}/humanize-guidance`, { method: "POST" }, "Generate final guidance");
        setMessage("Final guidance saved.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Final quality action failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Final Quality Gate</Title>
            <Text c="dimmed" size="sm">
              Run the final editorial checks after enough revisions are accepted and before exporting the publishable file.
            </Text>
          </div>
          <Badge color={finalStatus.color} variant="light">
            {finalStatus.label}
          </Badge>
        </Group>

        <Alert color={finalStatus.color} variant="light">
          {finalStatus.guidance}
        </Alert>
        {message && <Alert color="green">{message}</Alert>}
        {error && <Alert color="red">{error}</Alert>}

        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <QualityAction
            title="Post-rewrite Critic"
            status={`${postCriticCount}/7 lenses`}
            description="Rerun all Critic lenses against accepted rewrite text."
            loading={loading === "critic"}
            onClick={() => runAction("critic")}
          />
          <QualityAction
            title="Final drift check"
            status={latestDrift ? String(latestDrift.content?.overallDriftRisk || "checked") : "not checked"}
            description="Check voice, facts, timeline, motifs, characters, and contemporary view before export."
            loading={loading === "drift"}
            disabled={!latestRewriteJobId}
            onClick={() => runAction("drift")}
          />
          <QualityAction
            title="Final guidance"
            status={latestGuidance ? "ready" : "missing"}
            description="Turn Critic and drift findings into readable final next steps."
            loading={loading === "guidance"}
            disabled={!reports.length}
            onClick={() => runAction("guidance")}
          />
        </SimpleGrid>

        <Paper withBorder radius="md" p="md" bg="#fbfaf8">
          <Group justify="space-between" align="flex-start" mb="md">
            <div>
              <Text fw={900}>Before / After Summary</Text>
              <Text size="sm" c="dimmed">
                {outcome.recommendation}
              </Text>
            </div>
            <Badge color={outcome.averageDelta == null ? "gray" : outcome.averageDelta >= 0 ? "green" : "red"} variant="light">
              Avg delta {outcome.averageDelta == null ? "--" : `${outcome.averageDelta >= 0 ? "+" : ""}${outcome.averageDelta}`}
            </Badge>
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {comparisons.map((comparison) => (
              <Paper key={comparison.lens} withBorder radius="sm" p="sm" bg="white">
                <Group justify="space-between">
                  <Text size="sm" fw={800}>
                    {criticLenses[comparison.lens].label}
                  </Text>
                  <Badge color={comparison.delta == null ? "gray" : comparison.delta >= 0 ? "green" : "red"} variant="light">
                    {comparison.delta == null ? "pending" : `${comparison.delta >= 0 ? "+" : ""}${comparison.delta}`}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  Before {comparison.before ?? "--"} · After {comparison.after ?? "--"}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Paper>
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
    <Paper withBorder radius="md" p="md" bg="#fffdf8">
      <Stack>
        <Group justify="space-between">
          <Text fw={900}>{title}</Text>
          <Badge color={status.includes("not") || status.includes("missing") ? "yellow" : "teal"} variant="light">
            {status}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
        <Button color="grape" variant="light" loading={loading} disabled={disabled} onClick={onClick}>
          Run
        </Button>
      </Stack>
    </Paper>
  );
}

function getFinalQualityStatus({
  acceptedPercent,
  postCriticCount,
  driftRisk,
  regressionCount,
}: {
  acceptedPercent: number;
  postCriticCount: number;
  driftRisk: string;
  regressionCount: number;
}) {
  if (["high", "critical"].includes(driftRisk.toLowerCase())) {
    return {
      label: "hold export",
      color: "red",
      guidance: "High drift risk is present. Review drift findings and rerun affected chapters before exporting.",
    };
  }
  if (postCriticCount < 7) {
    return {
      label: "critic needed",
      color: "yellow",
      guidance: "Run the post-rewrite Critic before treating this manuscript as final.",
    };
  }
  if (regressionCount > 0) {
    return {
      label: "review regressions",
      color: "yellow",
      guidance: "Some Critic scores dropped after revision. Review the comparison before final export.",
    };
  }
  if (acceptedPercent >= 90) {
    return {
      label: "quality cleared",
      color: "green",
      guidance: "Final checks look good. Preview assembly, then export the selected format.",
    };
  }
  return {
    label: "more acceptance needed",
    color: "blue",
    guidance: "Quality checks may be run now, but final export is strongest after more accepted coverage.",
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
