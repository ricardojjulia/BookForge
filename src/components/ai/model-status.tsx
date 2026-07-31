"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";

type ConfiguredModel = {
  key: string;
  label: string;
  model: string;
  available: boolean;
};

type RecentIssue = {
  model: string;
  task: string;
  incidentCount: number;
  signature: string;
  sampleSize: number;
};

type ModelStatusPayload = {
  connected: boolean;
  baseUrl: string;
  availableModels: string[];
  configuredModels: ConfiguredModel[];
  rewriteModelSuitability?: {
    best: { model: string; score: number; label: string; reasons: string[] } | null;
    warning: string | null;
  };
  warnings: string[];
  recentIssues?: RecentIssue[];
  error: string | null;
};

export type ModelStatusHandle = { refresh: () => void };

export const ModelStatus = forwardRef<ModelStatusHandle>(function ModelStatus(_, ref) {
  const [status, setStatus] = useState<ModelStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);

  async function getStatus(): Promise<ModelStatusPayload> {
    try {
      const response = await fetch("/api/lmstudio/status", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load model status.");
      return result;
    } catch (error) {
      return {
        connected: false,
        baseUrl: "Unknown",
        availableModels: [],
        configuredModels: [],
        warnings: [],
        recentIssues: [],
        error: error instanceof Error ? error.message : "Unable to load model status.",
      };
    }
  }

  async function load() {
    setLoading(true);
    const result = await getStatus();
    setStatus(result);
    setLoading(false);
  }

  useImperativeHandle(ref, () => ({ refresh: load }));

  useEffect(() => {
    let active = true;
    getStatus().then((result) => {
      if (!active) return;
      setStatus(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Stack>
        <Group justify="space-between">
          <div>
            <Title order={2}>Model Status</Title>
            <Text c="dimmed">LM Studio connection, visible models, and configured task assignments.</Text>
          </div>
          <Button leftSection={<IconRefresh size={16} />} variant="light" color="grape" loading={loading} onClick={load}>
            Refresh
          </Button>
        </Group>

        {loading && !status ? <Loader color="grape" /> : null}

        {status && (
          <>
            <SimpleGrid cols={{ base: 1, md: 3 }}>
              <StatusMetric label="LM Studio" value={status.connected ? "Connected" : "Disconnected"} ok={status.connected} />
              <StatusMetric label="Base URL" value={status.baseUrl} />
              <StatusMetric label="Available models" value={status.availableModels.length} />
            </SimpleGrid>

            <Paper withBorder radius="sm" p="md" bg="#fbfaf8">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text size="sm" c="dimmed">
                    Best available rewrite model
                  </Text>
                  <Text fw={800}>
                    {status.rewriteModelSuitability?.best?.model || "None detected"}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {status.rewriteModelSuitability?.best?.reasons?.join(" ") || "Load a prose-capable instruction model in LM Studio."}
                  </Text>
                </div>
                <Badge color={(status.rewriteModelSuitability?.best?.score || 0) >= 80 ? "green" : "yellow"}>
                  {status.rewriteModelSuitability?.best?.score
                    ? `${status.rewriteModelSuitability.best.score}% suited`
                    : "Not scored"}
                </Badge>
              </Group>
            </Paper>

            {status.error && <Alert color="red">{status.error}</Alert>}
            {status.warnings.map((warning) => (
              <Alert key={warning} color="yellow">
                {warning}
              </Alert>
            ))}

            {!!status.recentIssues?.length && (
              <Paper withBorder radius="sm" p="md" bg="#fff8f0">
                <Text fw={700} mb="xs">
                  Recent issues (last 14 days)
                </Text>
                <Stack gap="xs">
                  {status.recentIssues.map((issue) => (
                    <Group key={`${issue.model}:${issue.task}`} justify="space-between" wrap="nowrap">
                      <Text size="sm">
                        <b>{issue.model}</b> on {issue.task} — {issue.signature.replaceAll("_", " ")}
                      </Text>
                      <Badge color="orange" variant="light">
                        {issue.incidentCount}/{issue.sampleSize} calls
                      </Badge>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            )}

            <Table striped highlightOnHover>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Configured model</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {status.configuredModels.map((item) => (
                  <tr key={item.key}>
                    <td>{item.label}</td>
                    <td>{item.model || "Not configured"}</td>
                    <td>
                      <Badge color={item.model && item.available ? "green" : item.model ? "yellow" : "gray"}>
                        {item.model && item.available ? "Available" : item.model ? "Unavailable" : "Unset"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div>
              <Text fw={700} mb="xs">
                Available models
              </Text>
              <ScrollArea h={120} type="auto">
                <Group gap="xs">
                  {status.availableModels.length ? (
                    status.availableModels.map((model) => (
                      <Badge key={model} color="teal" variant="light">
                        {model}
                      </Badge>
                    ))
                  ) : (
                    <Text c="dimmed">No models reported by LM Studio.</Text>
                  )}
                </Group>
              </ScrollArea>
            </div>
          </>
        )}
      </Stack>
    </Paper>
  );
});

function StatusMetric({ label, value, ok }: { label: string; value: string | number; ok?: boolean }) {
  return (
    <Paper withBorder radius="sm" p="md" bg="#fbfaf8">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Group gap="xs">
        <Text fw={800}>{value}</Text>
        {typeof ok === "boolean" && <Badge color={ok ? "green" : "red"}>{ok ? "OK" : "Check"}</Badge>}
      </Group>
    </Paper>
  );
}
