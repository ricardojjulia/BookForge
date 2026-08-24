"use client";

import { useState } from "react";
import { Alert, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";
import { mergeMetadataSnapshotBody } from "@/lib/book-metadata/selection";

export function RewritePlanActions({
  bookId,
  latestPlan,
}: {
  bookId: string;
  latestPlan?: Record<string, unknown> | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string>(() => stringValue(latestPlan?.rewriteObjective));

  async function generatePlan() {
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const queued = await fetchJson<{ content?: { jobId?: string } }>(
        `/api/books/${bookId}/rewrite-plan`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mergeMetadataSnapshotBody({ serverManaged: true })),
        },
        "Queue rewrite plan generation",
      );
      const jobId = queued.content?.jobId;
      if (!jobId) throw new Error("Rewrite plan queue handoff failed.");

      const result = await fetchJson<{ content?: Record<string, unknown> }>(
        `/api/books/${bookId}/rewrite-plan`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mergeMetadataSnapshotBody({ jobId })),
        },
        "Rewrite plan worker",
      );
      setPreview(stringValue(result.content?.rewriteObjective) || "Rewrite plan saved. Open the plan section below to review it.");
      setMessage("Rewrite plan saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate rewrite plan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack>
      <Alert color="grape" variant="light">
        <Text size="sm">
          This plan is based on Critic feedback only -- it does not use the Rewrite Strategy. Strategy controls how
          paragraphs actually get rewritten and is applied separately, when you run the rewrite.{" "}
          <Text component="a" href="#rewrite-strategy" c="grape" fw={700} td="underline">
            Review the strategy first ↓
          </Text>
        </Text>
      </Alert>
      <Group>
        <Button color="grape" loading={loading} onClick={generatePlan}>
          Generate Rewrite Plan
        </Button>
      </Group>
      {message && <Alert color="green">{message}</Alert>}
      {error && <Alert color="red">{error}</Alert>}
      {preview && (
        <Paper withBorder radius="md" p="md" bg="#fffdf8">
          <Text fw={800} size="sm">
            Latest saved plan
          </Text>
          <Text size="sm" c="dimmed" lineClamp={3}>
            {preview}
          </Text>
        </Paper>
      )}
    </Stack>
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
