"use client";

import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";

export type AiTaskPreflightData = {
  taskName: string;
  taskDescription: string;
  requiredModelType: string;
  selectedModel: string;
  lmStudioConnected: boolean;
  modelAvailable: boolean;
  estimatedUnits: number;
  expectedAiCalls: number;
  qualityProfile: string;
  contextSize: number;
  temperature: number;
  maxOutputTokens: number;
  planningMath?: string;
  targetTokensPerCall?: number;
  usableContextTokens?: number;
  estimatedSecondsPerCall?: number;
  estimatedTotalSeconds?: number;
  unitStrategy?: string;
  modelSizeB?: number | null;
  quantization?: string | null;
  warnings: string[];
  blocked?: boolean;
};

export function AiTaskPreflight({
  opened,
  data,
  loading,
  onProceed,
  onCancel,
}: {
  opened: boolean;
  data: AiTaskPreflightData | null;
  loading?: boolean;
  onProceed: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onCancel} title="AI Task Preflight" size="xl" centered>
      {data && (
        <Stack>
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={3}>{data.taskName}</Title>
              <Text c="dimmed">{data.taskDescription}</Text>
            </div>
            <Badge color={data.lmStudioConnected && data.modelAvailable ? "green" : "yellow"}>
              {data.lmStudioConnected && data.modelAvailable ? "Ready" : "Needs attention"}
            </Badge>
          </Group>

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <PreflightField label="Required model type" value={data.requiredModelType} />
            <PreflightField label="Selected model" value={data.selectedModel || "Not configured"} />
            <PreflightField label="AI provider status" value={data.lmStudioConnected ? "Connected" : "Disconnected"} />
            <PreflightField label="Model availability" value={data.modelAvailable ? "Available" : "Unavailable"} />
            <PreflightField label="Estimated manuscript units" value={data.estimatedUnits} />
            <PreflightField label="AI calls expected" value={data.expectedAiCalls} />
            <PreflightField label="Quality profile" value={data.qualityProfile} />
            <PreflightField label="Context size" value={`${data.contextSize.toLocaleString()} tokens`} />
            <PreflightField
              label="Usable input after reserves"
              value={`${(data.usableContextTokens || data.contextSize).toLocaleString()} tokens`}
            />
            <PreflightField
              label="Target tokens per call"
              value={`${(data.targetTokensPerCall || 0).toLocaleString()} tokens`}
            />
            <PreflightField label="Chunking strategy" value={data.unitStrategy || "Not planned"} />
            <PreflightField label="Detected model size" value={data.modelSizeB ? `${data.modelSizeB}B` : "Unknown"} />
            <PreflightField label="Detected quantization" value={data.quantization || "Unknown"} />
            <PreflightField
              label="Estimated seconds per call"
              value={data.estimatedSecondsPerCall ? formatDuration(data.estimatedSecondsPerCall) : "Unknown"}
            />
            <PreflightField
              label="Estimated total time"
              value={data.estimatedTotalSeconds ? formatDuration(data.estimatedTotalSeconds) : "Unknown"}
            />
            <PreflightField label="Temperature" value={data.temperature} />
            <PreflightField label="Max output tokens" value={data.maxOutputTokens} />
          </SimpleGrid>

          {data.planningMath && (
            <Paper withBorder radius="sm" p="md" bg="#fbfaf8">
              <Text fw={700} mb="xs">
                Call Planning Math
              </Text>
              <Text component="pre" size="xs" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {data.planningMath}
              </Text>
            </Paper>
          )}

          {data.warnings.map((warning) => (
            <Alert key={warning} color="yellow">
              {warning}
            </Alert>
          ))}

          <Group justify="space-between">
            <Button component="a" href="/settings" variant="outline" color="dark">
              Change Settings
            </Button>
            <Group>
              <Button variant="subtle" color="dark" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                color="grape"
                loading={loading}
                disabled={!data.lmStudioConnected || !data.modelAvailable || data.blocked}
                onClick={onProceed}
              >
                Proceed
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function PreflightField({ label, value }: { label: string; value: string | number }) {
  return (
    <Paper withBorder radius="sm" p="md" bg="#fbfaf8">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={800}>{value}</Text>
    </Paper>
  );
}
