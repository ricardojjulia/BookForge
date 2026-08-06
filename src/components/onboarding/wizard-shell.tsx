"use client";

import { useEffect, useState } from "react";
import { Button, Modal, Stepper, Text } from "@mantine/core";

export type WizardStepMeta = { label: string; description?: string };

/** Opens once, shortly after mount, when `shouldOpen` is true -- mirrors the
 * original SetupWizard's "auto-open on an unmet condition" idiom so multiple
 * wizards can reuse it without duplicating the effect. */
export function useWizardAutoOpen(shouldOpen: boolean) {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!shouldOpen) return;
    const timeoutId = window.setTimeout(() => setOpened(true), 0);
    return () => window.clearTimeout(timeoutId);
  }, [shouldOpen]);

  return [opened, setOpened] as const;
}

export function WizardShell({
  opened,
  onClose,
  onOpen,
  title,
  active,
  steps,
  triggerLabel,
  size = "lg",
  children,
}: {
  opened: boolean;
  onClose: () => void;
  onOpen: () => void;
  title: string;
  active: number;
  steps: WizardStepMeta[];
  triggerLabel: string;
  size?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Button variant="light" color="grape" size="xs" onClick={onOpen}>
        {triggerLabel}
      </Button>

      <Modal opened={opened} onClose={onClose} title={<Text fw={700}>{title}</Text>} size={size} closeOnClickOutside={false}>
        <Stepper active={active} color="grape" size="sm" mb="xl">
          {steps.map((step) => (
            <Stepper.Step key={step.label} label={step.label} description={step.description} />
          ))}
        </Stepper>
        {children}
      </Modal>
    </>
  );
}
