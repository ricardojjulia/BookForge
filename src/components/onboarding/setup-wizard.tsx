"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Stepper,
  Text,
  TextInput,
  Title,
  ThemeIcon,
} from "@mantine/core";
import {
  IconBrain,
  IconCheck,
  IconCloud,
  IconCpu,
  IconExternalLink,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { PROVIDER_META } from "@/lib/ai/providers";

// ── Types ──────────────────────────────────────────────────────────────────────

type Engine = "lmstudio" | "cloud";
type CloudProvider = "openai" | "anthropic" | "google";

const CLOUD_PROVIDERS: { value: CloudProvider; label: string }[] = [
  { value: "openai",     label: "OpenAI" },
  { value: "anthropic",  label: "Anthropic (Claude)" },
  { value: "google",     label: "Google Gemini" },
];

// Sourced from the shared provider catalog (@/lib/ai/providers) so the model
// list here can never drift out of sync with the rest of the app.
const CLOUD_MODELS: Record<CloudProvider, string[]> = {
  openai: PROVIDER_META.find((p) => p.id === "openai")?.defaultModels ?? [],
  anthropic: PROVIDER_META.find((p) => p.id === "anthropic")?.defaultModels ?? [],
  google: PROVIDER_META.find((p) => p.id === "google")?.defaultModels ?? [],
};

const CLOUD_API_LINKS: Record<CloudProvider, string> = {
  openai:    "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  google:    "https://aistudio.google.com/app/apikey",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function testLmStudio(baseUrl: string): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const res = await fetch("/api/lmstudio/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl }),
    });
    const data = await res.json();
    return { ok: Boolean(data.ok), models: data.models ?? [], error: data.error };
  } catch {
    return { ok: false, models: [], error: "Could not reach the server." };
  }
}

async function testCloudProvider(provider: CloudProvider, apiKey: string, model: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/lmstudio/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, apiKey, model }),
    });
    const data = await res.json();
    // Cloud test: if the API returns a non-error shape, treat as ok
    return { ok: res.ok && !data.error, error: data.error };
  } catch {
    return { ok: false, error: "Could not reach the provider." };
  }
}

async function saveSettings(userId: string, patch: Record<string, unknown>) {
  const supabase = createClient();
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

async function markAiSetupDone(userId: string, existing: string[]) {
  const supabase = createClient();
  const steps = Array.from(new Set([...existing, "ai_setup"]));
  await supabase
    .from("user_settings")
    .upsert({ user_id: userId, onboarding_completed_steps: steps }, { onConflict: "user_id" });
}

// ── Step components ───────────────────────────────────────────────────────────

function EngineCard({
  icon,
  title,
  description,
  badge,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Paper
      withBorder
      radius="md"
      p="lg"
      style={{
        cursor: "pointer",
        borderColor: selected ? "var(--mantine-color-grape-6)" : undefined,
        borderWidth: selected ? 2 : 1,
        background: selected ? "var(--mantine-color-grape-0)" : "white",
      }}
      onClick={onClick}
    >
      <Group gap="md" wrap="nowrap">
        <ThemeIcon size="xl" radius="md" color={selected ? "grape" : "gray"} variant="light">
          {icon}
        </ThemeIcon>
        <div>
          <Group gap="xs" mb={2}>
            <Text fw={700}>{title}</Text>
            {badge && <Badge size="xs" color="teal" variant="light">{badge}</Badge>}
          </Group>
          <Text size="sm" c="dimmed">{description}</Text>
        </div>
      </Group>
    </Paper>
  );
}

function LmStudioStep({
  onConnected,
}: {
  onConnected: (baseUrl: string, models: string[]) => void;
}) {
  const [baseUrl, setBaseUrl] = useState("http://localhost:1234/v1");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; models: string[]; error?: string } | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    const r = await testLmStudio(baseUrl);
    setResult(r);
    setTesting(false);
    if (r.ok) onConnected(baseUrl, r.models);
  }

  return (
    <Stack>
      <Paper withBorder radius="md" p="md" bg="#fbfaf8">
        <Text fw={600} mb="xs">Quick setup</Text>
        <Stack gap={6}>
          {[
            { n: 1, text: "Download and install LM Studio from lmstudio.ai" },
            { n: 2, text: 'Load any instruction-tuned model (7B+ works well) via the "Models" tab' },
            { n: 3, text: 'Start the local server in the "Local Server" tab — default port is 1234' },
          ].map(({ n, text }) => (
            <Group key={n} gap="sm" wrap="nowrap">
              <ThemeIcon size="sm" radius="xl" color="grape" variant="filled" style={{ flexShrink: 0 }}>
                <Text size="xs" fw={700}>{n}</Text>
              </ThemeIcon>
              <Text size="sm">{text}</Text>
            </Group>
          ))}
        </Stack>
        <Button
          component="a"
          href="https://lmstudio.ai"
          target="_blank"
          rel="noreferrer"
          variant="light"
          color="grape"
          size="xs"
          mt="sm"
          leftSection={<IconExternalLink size={12} />}
        >
          Open lmstudio.ai
        </Button>
      </Paper>

      <TextInput
        label="Server URL"
        description="The address of your running LM Studio local server."
        value={baseUrl}
        onChange={(e) => { setBaseUrl(e.currentTarget.value); setResult(null); }}
      />

      {result && !result.ok && (
        <Alert color="red" title="Not reachable">
          {result.error ?? "LM Studio is not responding. Make sure it is running and the local server is started."}
        </Alert>
      )}
      {result?.ok && (
        <Alert color="green" title="Connected" icon={<IconCheck size={16} />}>
          Found {result.models.length} model{result.models.length !== 1 ? "s" : ""}.
          {result.models.length === 0 && " Load at least one model in LM Studio to run AI tasks."}
        </Alert>
      )}

      <Button loading={testing} onClick={test} color="grape">
        Test connection
      </Button>
    </Stack>
  );
}

function CloudStep({
  onConnected,
}: {
  onConnected: (provider: CloudProvider, apiKey: string, model: string) => void;
}) {
  const [provider, setProvider] = useState<CloudProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(CLOUD_MODELS.openai[0]);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  function handleProviderChange(p: CloudProvider) {
    setProvider(p);
    setModel(CLOUD_MODELS[p][0]);
    setResult(null);
  }

  async function test() {
    setTesting(true);
    setResult(null);
    const r = await testCloudProvider(provider, apiKey, model);
    setResult(r);
    setTesting(false);
    if (r.ok) onConnected(provider, apiKey, model);
  }

  return (
    <Stack>
      <Select
        label="Provider"
        data={CLOUD_PROVIDERS}
        value={provider}
        onChange={(v) => v && handleProviderChange(v as CloudProvider)}
      />
      <PasswordInput
        label="API key"
        placeholder="sk-..."
        value={apiKey}
        onChange={(e) => { setApiKey(e.currentTarget.value); setResult(null); }}
        rightSection={
          <Button
            component="a"
            href={CLOUD_API_LINKS[provider]}
            target="_blank"
            rel="noreferrer"
            variant="subtle"
            size="compact-xs"
            color="grape"
            px={4}
          >
            Get key
          </Button>
        }
        rightSectionWidth={64}
      />
      <Select
        label="Model"
        data={CLOUD_MODELS[provider]}
        value={model}
        onChange={(v) => { if (v) { setModel(v); setResult(null); } }}
      />

      {result && !result.ok && (
        <Alert color="yellow" title="Could not verify">
          {result.error ?? "Could not confirm the key works. You can still proceed — the key will be saved and used for AI tasks."}
        </Alert>
      )}
      {result?.ok && (
        <Alert color="green" title="Ready" icon={<IconCheck size={16} />}>
          Provider connected and ready.
        </Alert>
      )}

      <Group>
        <Button loading={testing} onClick={test} color="grape" disabled={!apiKey.trim()}>
          Test connection
        </Button>
        {result && !result.ok && (
          <Button variant="subtle" color="gray" onClick={() => onConnected(provider, apiKey, model)}>
            Skip test and save
          </Button>
        )}
      </Group>
    </Stack>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function SetupWizard({
  userId,
  completedSteps,
  needsSetup,
}: {
  userId: string;
  completedSteps: string[];
  needsSetup: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [active, setActive] = useState(0);
  const [engine, setEngine] = useState<Engine>("lmstudio");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Configured values carried across steps
  const [lmBaseUrl, setLmBaseUrl] = useState("http://localhost:1234/v1");
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>("openai");
  const [cloudApiKey, setCloudApiKey] = useState("");
  const [cloudModel, setCloudModel] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (needsSetup && !completedSteps.includes("ai_setup")) {
      const timeoutId = window.setTimeout(() => setOpened(true), 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [needsSetup, completedSteps]);

  async function finish() {
    setSaving(true);
    try {
      if (engine === "lmstudio") {
        await saveSettings(userId, {
          lmstudio_base_url: lmBaseUrl,
          execution_mode: "local",
        });
      } else {
        await saveSettings(userId, {
          llm_provider: cloudProvider,
          llm_api_key: cloudApiKey,
          llm_model: cloudModel,
          execution_mode: "cloud",
        });
      }
      await markAiSetupDone(userId, completedSteps);
      setDone(true);
      setActive(2);
    } catch {
      // non-fatal — let the user close and configure manually
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setOpened(false);
  }

  return (
    <>
      <Button
        variant="light"
        color="grape"
        size="xs"
        onClick={() => { setActive(0); setConnected(false); setDone(false); setOpened(true); }}
      >
        {completedSteps.includes("ai_setup") ? "Reconfigure AI" : "Set up AI engine"}
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={<Text fw={700}>Set up your AI engine</Text>}
        size="lg"
        closeOnClickOutside={false}
      >
        <Stepper active={active} color="grape" size="sm" mb="xl">
          <Stepper.Step label="Choose" description="Pick your engine" />
          <Stepper.Step label="Configure" description="Connect and test" />
          <Stepper.Step label="Done" description="Ready to write" />
        </Stepper>

        {/* Step 0 — pick engine */}
        {active === 0 && (
          <Stack>
            <Text c="dimmed" size="sm">
              BookForge runs AI locally via LM Studio (private, free, requires your machine) or
              via a cloud provider (instant, pay-per-use, nothing to install).
            </Text>
            <EngineCard
              icon={<IconCpu size={20} />}
              title="LM Studio (local)"
              description="Runs entirely on your machine. Your manuscript never leaves. Requires a GPU or Apple Silicon for good performance."
              badge="Private"
              selected={engine === "lmstudio"}
              onClick={() => setEngine("lmstudio")}
            />
            <EngineCard
              icon={<IconCloud size={20} />}
              title="Cloud provider"
              description="OpenAI, Anthropic, or Google. Works on any machine, no GPU needed. You supply your own API key."
              selected={engine === "cloud"}
              onClick={() => setEngine("cloud")}
            />
            <Group justify="flex-end">
              <Button color="grape" onClick={() => setActive(1)}>
                Continue
              </Button>
            </Group>
          </Stack>
        )}

        {/* Step 1 — configure */}
        {active === 1 && (
          <Stack>
            {engine === "lmstudio" ? (
              <LmStudioStep
                onConnected={(url) => {
                  setLmBaseUrl(url);
                  setConnected(true);
                }}
              />
            ) : (
              <CloudStep
                onConnected={(p, key, m) => {
                  setCloudProvider(p);
                  setCloudApiKey(key);
                  setCloudModel(m);
                  setConnected(true);
                }}
              />
            )}
            <Group justify="space-between">
              <Button variant="subtle" color="gray" onClick={() => { setActive(0); setConnected(false); }}>
                Back
              </Button>
              <Button
                color="grape"
                loading={saving}
                onClick={finish}
                disabled={engine === "lmstudio" ? false : !cloudApiKey.trim()}
              >
                {connected ? "Save and finish" : "Skip test and save"}
              </Button>
            </Group>
          </Stack>
        )}

        {/* Step 2 — done */}
        {active === 2 && done && (
          <Stack align="center" py="lg">
            <ThemeIcon size={64} radius="xl" color="green" variant="light">
              <IconBrain size={36} />
            </ThemeIcon>
            <Title order={3} ta="center">You&apos;re ready</Title>
            <Text c="dimmed" ta="center" maw={380}>
              {engine === "lmstudio"
                ? "LM Studio is configured. Import a manuscript or create a new book to get started."
                : `${CLOUD_PROVIDERS.find((p) => p.value === cloudProvider)?.label} is configured. Import a manuscript or create a new book to get started.`}
            </Text>
            <Button color="grape" onClick={close}>
              Go to dashboard
            </Button>
          </Stack>
        )}
      </Modal>
    </>
  );
}
