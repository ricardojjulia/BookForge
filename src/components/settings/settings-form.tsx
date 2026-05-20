"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  buildModelRecommendations,
  type ModelRecommendation,
  type QualityProfile,
} from "@/lib/ai/model-recommendations";
import { PROVIDER_META } from "@/lib/ai/providers";
import type { LlmProvider } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

type ExecutionMode = "auto" | "local" | "cloud";

export type Settings = {
  // LM Studio
  lmstudio_base_url: string;
  primary_rewrite_model: string;
  reasoning_model: string;
  extraction_model: string;
  embedding_model: string;
  reranker_model: string;
  quality_profile: QualityProfile;
  context_window_tokens: number;
  max_output_tokens: number;
  temperature: number;
  top_p: number;
  repeat_penalty: number;
  // Standard provider
  llm_provider: LlmProvider;
  llm_api_key: string;
  llm_model: string;
  llm_base_url: string;
  llm_temperature: number;
  llm_max_output_tokens: number;
  // Execution routing
  execution_mode: ExecutionMode;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

function isQualityProfile(value: string): value is QualityProfile {
  return value === "fast" || value === "balanced" || value === "premium";
}

function normalizeQualityProfile(value: string | undefined): QualityProfile {
  return value && isQualityProfile(value) ? value : "balanced";
}

function profileLabel(profile: QualityProfile) {
  if (profile === "fast") return "Fast Mode";
  if (profile === "premium") return "Premium Mode";
  return "Balanced Mode";
}

export function SettingsForm({ userId, initial, onSaved }: { userId: string; initial?: Partial<Settings>; onSaved?: () => void }) {
  const [settings, setSettings] = useState<Settings>({
    lmstudio_base_url: initial?.lmstudio_base_url || "http://localhost:1234/v1",
    primary_rewrite_model: initial?.primary_rewrite_model || "",
    reasoning_model: initial?.reasoning_model || "",
    extraction_model: initial?.extraction_model || "",
    embedding_model: initial?.embedding_model || "",
    reranker_model: initial?.reranker_model || "",
    quality_profile: normalizeQualityProfile(initial?.quality_profile),
    context_window_tokens: Number(initial?.context_window_tokens ?? 32768),
    max_output_tokens: Number(initial?.max_output_tokens ?? 4096),
    temperature: Number(initial?.temperature ?? 0.7),
    top_p: Number(initial?.top_p ?? 0.9),
    repeat_penalty: Number(initial?.repeat_penalty ?? 1.05),
    llm_provider: (initial?.llm_provider as LlmProvider) || "lmstudio",
    llm_api_key: initial?.llm_api_key || "",
    llm_model: initial?.llm_model || "",
    llm_base_url: initial?.llm_base_url || "",
    llm_temperature: Number(initial?.llm_temperature ?? 0.7),
    llm_max_output_tokens: Number(initial?.llm_max_output_tokens ?? 4096),
    execution_mode: (initial?.execution_mode as ExecutionMode) || "auto",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<ModelRecommendation[]>([]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function applyRecommended(profile: QualityProfile = settings.quality_profile) {
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
      const optimized = buildModelRecommendations(detectedModels, profile);
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
        quality_profile: profile,
      }));
      setStatus(
        matched.length
          ? `${profileLabel(profile)} recommendations applied from ${detectedModels.length} available LM Studio model(s).`
          : "No suitable LM Studio models were detected. Load models in LM Studio, then try again.",
      );
    } catch (err) {
      setError(getErrorMessage(err, `Unable to build ${profileLabel(profile)} recommendations.`));
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
            llm_api_key: settings.llm_api_key.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (saveError) throw saveError;
      setStatus("Settings saved.");
      onSaved?.();
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

  async function testProviderConnection() {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: settings.llm_provider,
          apiKey: settings.llm_api_key,
          model: settings.llm_model,
          baseUrl: settings.llm_base_url || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Connection failed.");
      setStatus(result.message || "Connection successful.");
    } catch (err) {
      setError(getErrorMessage(err, "Connection failed."));
    } finally {
      setLoading(false);
    }
  }

  const selectedProviderMeta = PROVIDER_META.find((p) => p.id === settings.llm_provider);
  const providerModelOptions =
    selectedProviderMeta && selectedProviderMeta.defaultModels.length > 0
      ? selectedProviderMeta.defaultModels.map((m) => ({ value: m, label: m }))
      : undefined;

  return (
    <Paper withBorder radius="md" p="xl" bg="white">
      <Stack>
        <Title order={2}>AI Settings</Title>
        {status && <Alert color="green">{status}</Alert>}
        {error && <Alert color="red">{error}</Alert>}

        <Paper withBorder radius="sm" p="md" bg="#f8f7ff">
          <Stack gap="xs">
            <Select
              label="Execution mode"
              description={
                settings.execution_mode === "auto"
                  ? "Critic and Planning tasks use your cloud provider for stronger reasoning. Summaries, Blueprint, and Rewrite use LM Studio to keep costs low."
                  : settings.execution_mode === "cloud"
                    ? "All AI tasks are sent to your configured cloud provider. LM Studio is not used for execution."
                    : "All AI tasks run through LM Studio. The cloud provider is ignored for execution."
              }
              data={[
                { value: "auto", label: "Auto — optimize by task type (recommended)" },
                { value: "local", label: "LM Studio only" },
                { value: "cloud", label: "Cloud provider only" },
              ]}
              value={settings.execution_mode}
              onChange={(value) => update("execution_mode", (value as ExecutionMode) || "auto")}
            />
            {settings.execution_mode !== "local" && settings.llm_provider === "lmstudio" && (
              <Alert color="yellow" variant="light" p="xs">
                <Text size="xs">No cloud provider configured. Set one on the Cloud Provider tab before using cloud or auto mode.</Text>
              </Alert>
            )}
          </Stack>
        </Paper>

        <Tabs defaultValue="lmstudio">
          <Tabs.List>
            <Tabs.Tab value="lmstudio">LM Studio (local)</Tabs.Tab>
            <Tabs.Tab value="cloud">Cloud Provider</Tabs.Tab>
          </Tabs.List>

          {/* ------------------------------------------------------------------ */}
          {/* LM Studio tab                                                       */}
          {/* ------------------------------------------------------------------ */}
          <Tabs.Panel value="lmstudio" pt="md">
            <Stack>
              <Text c="dimmed" size="sm">
                Choose a profile, then optimize against the models currently loaded in LM Studio. Model names stay
                configurable because LM Studio exposes whatever local GGUF models you install.
              </Text>
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
                  onChange={(value) => {
                    const nextProfile = normalizeQualityProfile(value || undefined);
                    update("quality_profile", nextProfile);
                    void applyRecommended(nextProfile);
                  }}
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
                    Detected {profileLabel(settings.quality_profile)} Match
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
                <Button
                  variant="light"
                  color="grape"
                  loading={loading}
                  onClick={() => void applyRecommended(settings.quality_profile)}
                >
                  Optimize {profileLabel(settings.quality_profile)} Recommendations
                </Button>
                <Button variant="outline" color="dark" loading={loading} onClick={testConnection}>
                  Test Connection
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          {/* ------------------------------------------------------------------ */}
          {/* Cloud provider tab                                                  */}
          {/* ------------------------------------------------------------------ */}
          <Tabs.Panel value="cloud" pt="md">
            <Stack>
              <Text c="dimmed" size="sm">
                Use a hosted LLM provider instead of (or alongside) LM Studio. The selected provider will be used
                for all AI tasks when the active provider is set to anything other than LM Studio.
              </Text>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <Select
                  label="Active provider"
                  data={PROVIDER_META.map((p) => ({ value: p.id, label: p.label }))}
                  value={settings.llm_provider}
                  onChange={(value) => {
                    const provider = (value as LlmProvider) || "lmstudio";
                    update("llm_provider", provider);
                    // Always reset model to first default when switching providers
                    const meta = PROVIDER_META.find((p) => p.id === provider);
                    if (meta?.defaultModels[0]) {
                      update("llm_model", meta.defaultModels[0]);
                    }
                  }}
                />
                {providerModelOptions ? (
                  <Select
                    label="Model"
                    description="Choose a preset or type a custom model ID"
                    data={providerModelOptions}
                    value={settings.llm_model || providerModelOptions[0]?.value}
                    onChange={(value) => update("llm_model", value || "")}
                    searchable
                  />
                ) : (
                  <TextInput
                    label="Model"
                    placeholder="e.g. local-model"
                    value={settings.llm_model}
                    onChange={(event) => update("llm_model", event.currentTarget.value)}
                  />
                )}
                {selectedProviderMeta?.requiresApiKey && (
                  <PasswordInput
                    label="API key"
                    placeholder="sk-..."
                    value={settings.llm_api_key}
                    onChange={(event) => update("llm_api_key", event.currentTarget.value)}
                  />
                )}
                <TextInput
                  label="Custom base URL"
                  description="Leave blank to use the provider default"
                  placeholder={selectedProviderMeta?.defaultBaseUrl || ""}
                  value={settings.llm_base_url}
                  onChange={(event) => update("llm_base_url", event.currentTarget.value)}
                />
                <NumberInput
                  label="Temperature"
                  min={0}
                  max={2}
                  step={0.05}
                  value={settings.llm_temperature}
                  onChange={(value) => update("llm_temperature", Number(value ?? 0.7))}
                />
                <NumberInput
                  label="Max output tokens"
                  value={settings.llm_max_output_tokens}
                  onChange={(value) => update("llm_max_output_tokens", Number(value || 4096))}
                />
              </SimpleGrid>
              <Group>
                <Button variant="outline" color="dark" loading={loading} onClick={testProviderConnection}>
                  Test Connection
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <Group justify="flex-end">
          <Button color="grape" loading={loading} onClick={save}>
            Save Settings
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}