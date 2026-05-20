"use client";

import { useState } from "react";
import { Alert, Badge, Button, Checkbox, Paper, Stack, Text, Title } from "@mantine/core";
import { fetchJson } from "@/lib/http/fetch-json";

const STEPS = [
  { key: "import", label: "Import your manuscript", description: "Upload a TXT, DOCX, EPUB, or Markdown file — or paste text directly." },
  { key: "structure", label: "Review chapter structure", description: "Confirm chapters and scenes parsed correctly. Use the repair tools if anything is off." },
  { key: "blueprint", label: "Generate Manuscript Blueprint", description: "Run the AI analysis to build your book bible — characters, themes, and style notes." },
  { key: "critic", label: "Run BookForge Critic", description: "Run all seven evaluation lenses to get a scored baseline for your manuscript." },
  { key: "rewrite_plan", label: "Generate a Rewrite Plan", description: "Use the Rewrite Architect to build a structured plan before making changes." },
  { key: "rewrite", label: "Run a guided rewrite batch", description: "Start with a single chapter to check that the voice and style feel right." },
  { key: "review", label: "Review and accept revisions", description: "Accept, reject, or rerun each paragraph revision in the Revision Review page." },
  { key: "export", label: "Export your manuscript", description: "Build the final manuscript and download it in your preferred format." },
] as const;

type StepKey = typeof STEPS[number]["key"];

type Props = {
  completedSteps: string[];
};

export function OnboardingChecklist({ completedSteps: initial }: Props) {
  const [completed, setCompleted] = useState<Set<string>>(new Set(initial));
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || completed.size === STEPS.length) return null;

  async function toggle(key: StepKey) {
    const next = new Set(completed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCompleted(next);
    setSaving(true);
    try {
      await fetchJson("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: Array.from(next) }),
      });
    } finally {
      setSaving(false);
    }
  }

  const remaining = STEPS.length - completed.size;

  return (
    <Alert color="grape" variant="light" mb="xl" withCloseButton onClose={() => setDismissed(true)}>
      <Stack gap="sm">
        <Title order={4}>
          Getting started with BookForge
          <Badge color="grape" variant="filled" size="sm" ml="sm">{remaining} step{remaining !== 1 ? "s" : ""} left</Badge>
        </Title>
        {STEPS.map((step) => (
          <Paper key={step.key} radius="sm" p="sm" bg="white" withBorder>
            <Checkbox
              checked={completed.has(step.key)}
              onChange={() => toggle(step.key)}
              disabled={saving}
              label={
                <Stack gap={2}>
                  <Text size="sm" fw={500} td={completed.has(step.key) ? "line-through" : undefined}>{step.label}</Text>
                  <Text size="xs" c="dimmed">{step.description}</Text>
                </Stack>
              }
            />
          </Paper>
        ))}
        <Button variant="subtle" size="xs" color="gray" onClick={() => setDismissed(true)}>
          Dismiss checklist
        </Button>
      </Stack>
    </Alert>
  );
}
