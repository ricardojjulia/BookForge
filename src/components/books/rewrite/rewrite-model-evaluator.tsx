"use client";

import { useState } from "react";
import { Alert, Badge, Button, Group, Paper, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";

type Candidate = { model: string; score: number; label: string; reasons: string[]; math: string[] };

type RewriteModelSuitability = {
  best: Candidate | null;
  candidates: Candidate[];
  warning: string | null;
};

type StatusResponse = {
  connected?: boolean;
  baseUrl?: string;
  qualityProfile?: string;
  contextWindowTokens?: number;
  availableModels?: string[];
  configuredModels?: Array<{ key: string; label: string; model: string; available: boolean }>;
  rewriteModelSuitability?: RewriteModelSuitability;
  configuredRewriteModel?: { model: string; available: boolean; suitability: Candidate | null };
  configuredRewriteModelSuitability?: Candidate | null;
  cloudProvider?: { provider: string; model: string | null; executionMode: string; usedForPlanning: boolean; usedForRewrite: boolean } | null;
  warnings?: string[];
  error?: string | null;
};

export function RewriteModelEvaluator({
  bookId,
}: {
  bookId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<RewriteModelSuitability | null>(null);
  const [configuredRewriteInfo, setConfiguredRewriteInfo] = useState<StatusResponse["configuredRewriteModel"] | null>(null);
  const [configuredRewriteModel, setConfiguredRewriteModel] = useState<Candidate | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [error, setError] = useState("");

  async function evaluate() {
    setLoading(true);
    setError("");
    try {
      const status = await fetchJson<StatusResponse>(
        "/api/lmstudio/status",
        { cache: "no-store" },
        "Rewrite model evaluation",
      );
      setSelection(status.rewriteModelSuitability || null);
      setConfiguredRewriteInfo(status.configuredRewriteModel || null);
      setConfiguredRewriteModel(status.configuredRewriteModel?.suitability || status.configuredRewriteModelSuitability || null);
      await fetchJson(
        `/api/books/${bookId}/rewrite-workflow`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            metadata: {
              modelEvaluation: {
                evaluatedAt: new Date().toISOString(),
                connected: Boolean(status.connected),
                baseUrl: status.baseUrl || "",
                qualityProfile: status.qualityProfile || "",
                contextWindowTokens: status.contextWindowTokens || 0,
                availableModelCount: status.availableModels?.length || 0,
                configuredRewriteModel: {
                  model: status.configuredRewriteModel?.model || "",
                  available: Boolean(status.configuredRewriteModel?.available),
                  score: status.configuredRewriteModel?.suitability?.score ?? null,
                  label: status.configuredRewriteModel?.suitability?.label || "",
                  reasons: status.configuredRewriteModel?.suitability?.reasons || [],
                },
                bestAvailableModel: status.rewriteModelSuitability?.best || null,
                warning: status.rewriteModelSuitability?.warning || null,
                warnings: status.warnings || [],
                error: status.error || null,
                // Rewrite may not even use LM Studio — see cloudProvider.usedForRewrite.
                // Without this, a cloud-configured rewrite always reads as
                // "no suitable model" downstream in the readiness gate, since
                // that reflects LM Studio's local model list, not the cloud model actually used.
                usedForRewrite: Boolean(status.cloudProvider?.usedForRewrite),
                cloudProvider: status.cloudProvider?.provider || "",
                cloudModel: status.cloudProvider?.model || "",
              },
            },
          }),
        },
        "Save rewrite model evaluation",
      );
      setSavedMessage("Model evaluation saved to this rewrite workflow.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to evaluate rewrite models.");
    } finally {
      setLoading(false);
    }
  }

  const best = selection?.best;
  const candidates = selection?.candidates || [];

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mb="xl">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Rewrite Model Evaluation</Title>
            <Text c="dimmed">
              Queries LM Studio and scores the currently available models for full-book rewrite suitability.
            </Text>
          </div>
          <Button color="teal" variant="light" loading={loading} onClick={evaluate}>
            Evaluate Models
          </Button>
        </Group>

        {error && <Alert color="red">{error}</Alert>}
        {savedMessage && <Alert color="green" variant="light">{savedMessage}</Alert>}
        {selection?.warning && <Alert color="yellow">{selection.warning}</Alert>}

        {best ? (
          <Stack>
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <ModelCard title="Best available model" model={best} />
              <ModelCard
                title="Current configured rewrite model"
                model={configuredRewriteModel}
                emptyText={
                  configuredRewriteInfo?.model
                    ? `${configuredRewriteInfo.model} (${configuredRewriteInfo.available ? "available, not suitable" : "not loaded"})`
                    : "Not configured."
                }
              />
            </SimpleGrid>

            <div>
              <Text fw={800} mb="xs">
                Ranked available rewrite candidates
              </Text>
              <SimpleGrid cols={{ base: 1, xl: 2 }}>
                {candidates.slice(0, 8).map((candidate, index) => (
                  <RankedModelCard key={candidate.model} candidate={candidate} rank={index + 1} />
                ))}
              </SimpleGrid>
            </div>
          </Stack>
        ) : (
          <Text c="dimmed">No model evaluation has been run on this page yet.</Text>
        )}
      </Stack>
    </Paper>
  );
}

function RankedModelCard({ candidate, rank }: { candidate: Candidate; rank: number }) {
  const color = candidate.score >= 80 ? "green" : candidate.score >= 55 ? "yellow" : "red";

  return (
    <Paper withBorder radius="sm" p="md" bg="#fbfaf8">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Badge color="gray" variant="light">
              #{rank}
            </Badge>
            <Text fw={900} size="sm" style={{ overflowWrap: "anywhere" }}>
              {candidate.model}
            </Text>
          </Group>
          <Badge color={color} variant="filled">
            {candidate.score}%
          </Badge>
        </Group>
        <Progress value={candidate.score} color={color} radius="xl" />
        <Group gap="xs">
          <Badge color={color} variant="light">
            {candidate.label}
          </Badge>
          {candidate.score >= 80 ? (
            <Text size="xs" c="dimmed">
              Meets rewrite target
            </Text>
          ) : (
            <Text size="xs" c="dimmed">
              Below 80% target
            </Text>
          )}
        </Group>
        <Stack gap={4}>
          {candidate.reasons.slice(0, 5).map((reason) => (
            <Text key={reason} size="xs" c="dimmed">
              • {reason}
            </Text>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}

function ModelCard({
  title,
  model,
  emptyText = "No model detected.",
}: {
  title: string;
  model: Candidate | null;
  emptyText?: string;
}) {
  return (
    <Paper withBorder radius="sm" p="md" bg="#fbfaf8">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="sm" c="dimmed">
            {title}
          </Text>
          <Text fw={900}>{model?.model || emptyText}</Text>
          {model && (
            <Text size="sm" c="dimmed">
              {model.reasons.join(" ")}
            </Text>
          )}
        </div>
        {model && (
          <Badge color={model.score >= 80 ? "green" : model.score >= 55 ? "yellow" : "red"} size="lg">
            {model.score}%
          </Badge>
        )}
      </Group>
    </Paper>
  );
}
