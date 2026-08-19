"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionIcon, Button, Group, Paper, Progress, Stack, Text, Title, Tooltip } from "@mantine/core";
import { IconCircle, IconCircleCheck, IconX } from "@tabler/icons-react";
import { CHECKLIST_DISMISSED_STEP, type OnboardingChecklistItem } from "@/lib/onboarding/checklist";
import { markOnboardingStepDone } from "@/lib/onboarding/steps";

type Props = {
  userId: string;
  items: OnboardingChecklistItem[];
  completedSteps: string[];
  initiallyDismissed: boolean;
};

export function GettingStartedChecklist({ userId, items, completedSteps, initiallyDismissed }: Props) {
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  const [dismissing, setDismissing] = useState(false);
  const allDone = items.every((item) => item.done);

  if (dismissed || allDone) return null;

  const doneCount = items.filter((item) => item.done).length;

  async function dismiss() {
    setDismissing(true);
    try {
      await markOnboardingStepDone(userId, CHECKLIST_DISMISSED_STEP, completedSteps);
      setDismissed(true);
    } finally {
      setDismissing(false);
    }
  }

  return (
    <Paper withBorder radius="md" p="lg" mb="xl" bg="#faf9ff">
      <Group justify="space-between" align="flex-start" mb="sm">
        <div>
          <Title order={4}>Getting started</Title>
          <Text size="sm" c="dimmed">
            {doneCount} of {items.length} steps complete
          </Text>
        </div>
        <Tooltip label="Dismiss" withArrow>
          <ActionIcon variant="subtle" color="gray" size="sm" loading={dismissing} onClick={dismiss}>
            <IconX size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Progress value={(doneCount / items.length) * 100} color="grape" size="sm" radius="xl" mb="md" />
      <Stack gap="xs">
        {items.map((item) => (
          <Group key={item.key} justify="space-between" wrap="nowrap" gap="xs">
            <Group gap="xs" wrap="nowrap">
              {item.done ? (
                <IconCircleCheck size={18} color="var(--mantine-color-teal-6)" />
              ) : (
                <IconCircle size={18} color="var(--mantine-color-gray-5)" />
              )}
              <Text size="sm" c={item.done ? "dimmed" : undefined} td={item.done ? "line-through" : undefined}>
                {item.label}
              </Text>
            </Group>
            {!item.done && (
              <Button component={Link} href={item.ctaHref} size="xs" variant="light" color="grape">
                {item.ctaLabel}
              </Button>
            )}
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}
