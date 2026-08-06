"use client";

import { useState } from "react";
import { Anchor, Button, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconBook2, IconFlask, IconGauge, IconSparkles } from "@tabler/icons-react";
import Link from "next/link";
import { useWizardAutoOpen, WizardShell } from "@/components/onboarding/wizard-shell";
import { markOnboardingStepDone, ONBOARDING_STEPS, shouldAutoOpenBookPipelineTour } from "@/lib/onboarding/steps";

type Step = {
  label: string;
  description: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  linkHref: string;
  linkLabel: string;
};

function buildSteps(bookId: string): Step[] {
  return [
    {
      label: "Overview",
      description: "Orientation",
      icon: <IconGauge size={22} />,
      title: "Overview is your starting point",
      body: "The Production Command Center tells you the single next best action for this book -- and every other screen is one click away from the subnav above.",
      linkHref: `/books/${bookId}`,
      linkLabel: "Go to Overview",
    },
    {
      label: "Studio",
      description: "Run AI work",
      icon: <IconSparkles size={22} />,
      title: "Studio is where the AI work happens",
      body: "Generate drafts, run BookForge Critic, or launch a full Auto-Review cycle. Everything Studio kicks off shows up in Jobs History while it runs.",
      linkHref: `/books/${bookId}/studio`,
      linkLabel: "Go to Studio",
    },
    {
      label: "Critic & Quality",
      description: "Review results",
      icon: <IconFlask size={22} />,
      title: "Critic & Quality is where you review results",
      body: "Compare before/after scores across all 8 critic lenses, check the post-run quality gate, and build or approve the rewrite plan.",
      linkHref: `/books/${bookId}/critic-quality`,
      linkLabel: "Go to Critic & Quality",
    },
    {
      label: "Manuscript",
      description: "Edit chapters",
      icon: <IconBook2 size={22} />,
      title: "Manuscript is for hands-on editing",
      body: "Browse chapters, lock passages you don't want touched, and edit scene and chapter metadata directly.",
      linkHref: `/books/${bookId}/manuscript`,
      linkLabel: "Go to Manuscript",
    },
  ];
}

export function BookPipelineWizard({
  bookId,
  userId,
  completedSteps,
}: {
  bookId: string;
  userId: string;
  completedSteps: string[];
}) {
  const [opened, setOpened] = useWizardAutoOpen(shouldAutoOpenBookPipelineTour(completedSteps));
  const [active, setActive] = useState(0);
  const steps = buildSteps(bookId);
  const step = steps[active];
  const isLastStep = active === steps.length - 1;

  async function finish() {
    setOpened(false);
    await markOnboardingStepDone(userId, ONBOARDING_STEPS.bookPipelineTour, completedSteps);
  }

  return (
    <WizardShell
      opened={opened}
      onClose={() => { void finish(); }}
      onOpen={() => { setActive(0); setOpened(true); }}
      title="Book Forge workflow tour"
      triggerLabel="Take the tour"
      active={active}
      steps={steps.map(({ label, description }) => ({ label, description }))}
    >
      <Stack align="center" py="md">
        <ThemeIcon size={56} radius="xl" color="grape" variant="light">
          {step.icon}
        </ThemeIcon>
        <Text fw={800} size="lg" ta="center">
          {step.title}
        </Text>
        <Text c="dimmed" ta="center" maw={420}>
          {step.body}
        </Text>
        <Anchor component={Link} href={step.linkHref} size="sm">
          {step.linkLabel} →
        </Anchor>
      </Stack>

      <Group justify="space-between" mt="lg">
        <Button variant="subtle" color="gray" disabled={active === 0} onClick={() => setActive((n) => n - 1)}>
          Back
        </Button>
        {isLastStep ? (
          <Button color="grape" onClick={() => { void finish(); }}>
            Done
          </Button>
        ) : (
          <Button color="grape" onClick={() => setActive((n) => n + 1)}>
            Next
          </Button>
        )}
      </Group>
    </WizardShell>
  );
}
