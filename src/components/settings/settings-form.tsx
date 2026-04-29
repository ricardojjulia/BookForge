"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { buildBalancedRecommendations, type ModelRecommendation } from "@/lib/ai/model-recommendations";
import { createClient } from "@/lib/supabase/client";

type Settings = {
  lmstudio_base_url: string;
  primary_rewrite_model: string;
  reasoning_model: string;
  extraction_model: string;
  embedding_model: string;
  reranker_model: string;
  quality_profile: string;
  context_window_tokens: number;
  max_output_tokens: number;
  temperature: number;
  top_p: number;
  repeat_penalty: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

export function SettingsForm({ userId, initial }: { userId: string; initial?: Partial<Settings> }) {
  const [settings, setSettings] = useState<Settings>({
    lmstudio_base_url: initial?.lmstudio_base_url || "http://localhost:1234/v1",
    primary_rewrite_model: initial?.primary_rewrite_model || "",
    reasoning_model: initial?.reasoning_model || "",
    extraction_model: initial?.extraction_model || "",
    embedding_model: initial?.embedding_model || "",
    reranker_model: initial?.reranker_model || "",
    quality_profile: initial?.quality_profile || "balanced",
    context_window_tokens: Number(initial?.context_window_tokens ?? 32768),
    max_output_tokens: Number(initial?.max_output_tokens ?? 4096),
    temperature: Number(initial?.temperature ?? 0.7),
    top_p: Number(initial?.top_p ?? 0.9),
    repeat_penalty: Number(initial?.repeat_penalty ?? 1.05),
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<ModelRecommendation[]>([]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function applyRecommended() {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/lmstudio/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl: settings.lmstudio_base_url }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to inspect LM Studio models.");

      const detectedModels = Array.isArray(result.models) ? result.models : [];
      const optimized = buildBalancedRecommendations(detectedModels);
      const matched = optimized.filter((item) => item.selectedModel);

      setRecommendations(optimized);
      setSettings((current) => ({
        ...current,
        primary_rewrite_model:
          optimized.find((item) => item.task === "primary_rewrite_model")?.selectedModel ||
          current.primary_rewrite_model,
        reasoning_model:
          optimized.find((item) => item.task === "reasoning_model")?.selectedModel || current.reasoning_model,
        extraction_model:
          optimized.find((item) => item.task === "extraction_model")?.selectedModel || current.extraction_model,
        embedding_model:
          optimized.find((item) => item.task === "embedding_model")?.selectedModel || current.embedding_model,
        reranker_model: optimized.find((item) => item.task === "reranker_model")?.selectedModel || "",
        quality_profile: "balanced",
      }));
      setStatus(
        matched.length
          ? `Balanced recommendations applied from ${detectedModels.length} available LM Studio model(s).`
          : "No suitable LM Studio models were detected. Load models in LM Studio, then try again.",
      );
    } catch (err) {
      setError(getErrorMessage(err, "Unable to build balanced recommendations."));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase
        .from("user_settings")
        .upsert(
          {
            user_id: userId,
            ...settings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (saveError) throw saveError;
      setStatus("Settings saved.");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save settings."));
    } finally {
      setLoading(false);
    }
  }

  async function testConnection() {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/lmstudio/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl: settings.lmstudio_base_url }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Connection failed.");
      setStatus(`Connected. Models visible: ${result.models?.slice(0, 5).join(", ") || "none listed"}`);
    } catch (err) {
      setError(getErrorMessage(err, "Connection failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Stack>
        <Title order={2}>LM Studio Settings</Title>
        <Text c="dimmed">
          Balanced Mode is the default for a 16-inch MacBook Pro. Model names stay configurable because LM Studio
          exposes whatever local GGUF models you install.
        </Text>
        {status && <Alert color="green">{status}</Alert>}
        {error && <Alert color="red">{error}</Alert>}
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <TextInput
            label="LM Studio base URL"
            value={settings.lmstudio_base_url}
            onChange={(event) => update("lmstudio_base_url", event.currentTarget.value)}
          />
          <Select
            label="Quality profile"
            data={[
              { value: "fast", label: "Fast Mode" },
              { value: "balanced", label: "Balanced Mode" },
              { value: "premium", label: "Premium Mode" },
            ]}
            value={settings.quality_profile}
            onChange={(value) => update("quality_profile", value || "balanced")}
          />
          <TextInput
            label="Primary rewrite model"
            value={settings.primary_rewrite_model}
            onChange={(event) => update("primary_rewrite_model", event.currentTarget.value)}
          />
          <TextInput
            label="Reasoning model"
            value={settings.reasoning_model}
            onChange={(event) => update("reasoning_model", event.currentTarget.value)}
          />
          <TextInput
            label="Extraction model"
            value={settings.extraction_model}
            onChange={(event) => update("extraction_model", event.currentTarget.value)}
          />
          <TextInput
            label="Embedding model"
            value={settings.embedding_model}
            onChange={(event) => update("embedding_model", event.currentTarget.value)}
          />
          <TextInput
            label="Reranker model"
            value={settings.reranker_model}
            onChange={(event) => update("reranker_model", event.currentTarget.value)}
          />
          <NumberInput
            label="Context window tokens"
            value={settings.context_window_tokens}
            onChange={(value) => update("context_window_tokens", Number(value || 32768))}
          />
          <NumberInput
            label="Max output tokens"
            value={settings.max_output_tokens}
            onChange={(value) => update("max_output_tokens", Number(value || 4096))}
          />
          <NumberInput
            label="Temperature"
            min={0}
            max={2}
            step={0.05}
            value={settings.temperature}
            onChange={(value) => update("temperature", Number(value ?? 0.7))}
          />
          <NumberInput
            label="Top P"
            min={0}
            max={1}
            step={0.05}
            value={settings.top_p}
            onChange={(value) => update("top_p", Number(value ?? 0.9))}
          />
          <NumberInput
            label="Repeat penalty"
            min={0}
            max={2}
            step={0.01}
            value={settings.repeat_penalty}
            onChange={(value) => update("repeat_penalty", Number(value ?? 1.05))}
          />
        </SimpleGrid>
        {recommendations.length > 0 && (
          <Paper withBorder radius="sm" p="md" bg="#fbfaf8">
            <Title order={4} mb="sm">
              Detected Balanced Match
            </Title>
            <Table striped highlightOnHover>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Selected model</th>
                  <th>Why</th>
                  <th>Alternatives</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((item) => (
                  <tr key={item.task}>
                    <td>{item.label}</td>
                    <td>
                      {item.selectedModel ? (
                        <Badge color="green" variant="light">
                          {item.selectedModel}
                        </Badge>
                      ) : (
                        <Badge color="yellow" variant="light">
                          No match
                        </Badge>
                      )}
                    </td>
                    <td>
                      <Text size="sm">{item.reason}</Text>
                    </td>
                    <td>
                      <Text size="sm" c="dimmed">
                        {item.alternatives.join(", ") || "None"}
                      </Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Paper>
        )}
        <Group justify="space-between">
          <Button variant="light" color="grape" loading={loading} onClick={applyRecommended}>
            Optimize Balanced Recommendations
          </Button>
          <Group>
            <Button variant="outline" color="dark" loading={loading} onClick={testConnection}>
              Test Connection
            </Button>
            <Button color="grape" loading={loading} onClick={save}>
              Save Settings
            </Button>
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
}
