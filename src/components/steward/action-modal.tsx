"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";

// window.confirm/prompt aren't supported in every environment this console
// runs in (confirmed live: "prompt() is not supported" in production) -- this
// replaces every native dialog in the Steward console with the same
// type-to-confirm Modal pattern already established in delete-book-button.tsx.
export function StewardActionModal({
  opened,
  title,
  message,
  confirmLabel,
  confirmColor = "red",
  loading = false,
  error = null,
  requireTypedConfirmation,
  inputLabel,
  inputType = "text",
  onCancel,
  onConfirm,
}: {
  opened: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  confirmColor?: string;
  loading?: boolean;
  error?: string | null;
  /** If set, the user must type this exact string into a confirmation field (e.g. "DELETE"). */
  requireTypedConfirmation?: string;
  /** If set (and requireTypedConfirmation isn't), collects free-text input (e.g. an email) passed to onConfirm. */
  inputLabel?: string;
  inputType?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  function handleClose() {
    setValue("");
    onCancel();
  }

  const needsInput = Boolean(requireTypedConfirmation || inputLabel);
  const canConfirm = requireTypedConfirmation ? value.trim() === requireTypedConfirmation : !inputLabel || value.trim().length > 0;

  return (
    <Modal opened={opened} onClose={handleClose} title={title} centered>
      <Stack>
        <Text size="sm">{message}</Text>
        {error && <Alert color="red">{error}</Alert>}
        {needsInput && (
          <TextInput
            label={requireTypedConfirmation ? `Type "${requireTypedConfirmation}" to confirm` : inputLabel}
            type={requireTypedConfirmation ? "text" : inputType}
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            autoFocus
          />
        )}
        <Group justify="flex-end">
          <Button variant="subtle" color="dark" disabled={loading} onClick={handleClose}>
            Cancel
          </Button>
          <Button color={confirmColor} loading={loading} disabled={!canConfirm} onClick={() => onConfirm(value)}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
