"use client";

import { useRef } from "react";
import Link from "next/link";
import { Anchor, Group, Paper, Text } from "@mantine/core";
import { IconTerminal2 } from "@tabler/icons-react";
import { ModelStatus, type ModelStatusHandle } from "@/components/ai/model-status";
import { PriceAdvisoryBanner } from "@/components/settings/price-advisory-banner";
import { SettingsForm } from "@/components/settings/settings-form";
import type { Settings } from "@/components/settings/settings-form";

export function SettingsPageClient({
  userId,
  initial,
  hasApiKey,
}: {
  userId: string;
  initial?: Partial<Settings>;
  hasApiKey?: boolean;
}) {
  const modelStatusRef = useRef<ModelStatusHandle>(null);

  return (
    <>
      <PriceAdvisoryBanner />
      <SettingsForm userId={userId} initial={initial} hasApiKey={hasApiKey} onSaved={() => modelStatusRef.current?.refresh()} />
      <div style={{ marginTop: 24 }}>
        <ModelStatus ref={modelStatusRef} />
      </div>
      <Paper withBorder radius="md" p="md" mt={24} bg="#0f172a">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <IconTerminal2 size={20} color="#7dd3fc" />
            <div>
              <Text fw={700} c="white" size="sm">Geek Analytics</Text>
              <Text size="xs" c="#94a3b8">
                The full engineering telemetry behind every run -- job health, model-call volume, snapshot
                provenance, the works. For the curious.
              </Text>
            </div>
          </Group>
          <Anchor component={Link} href="/settings/geek-analytics" c="#7dd3fc" fw={600} size="sm" style={{ whiteSpace: "nowrap" }}>
            Open →
          </Anchor>
        </Group>
      </Paper>
    </>
  );
}
