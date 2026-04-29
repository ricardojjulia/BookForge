"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";

export function ResetRewriteButton({ bookId, size = "sm" }: { bookId: string; size?: "xs" | "sm" | "md" }) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canReset = confirmation.trim() === "RESET REWRITE";

  async function resetRewrite() {
    setLoading(true);
    setError("");
    try {
      await fetchJson(
        `/api/books/${bookId}/rewrite-reset`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmation: "RESET REWRITE" }),
        },
        "Reset rewrite work",
      );
      setOpened(false);
      setConfirmation("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset rewrite work.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        color="red"
        variant="outline"
        size={size}
        leftSection={<IconRefresh size={16} />}
        onClick={() => setOpened(true)}
      >
        Reset Rewrite Work
      </Button>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Reset rewrite work" centered>
        <Stack>
          <Text>
            This deletes all rewrite suggestions, rewrite jobs, accepted approvals, rewrite drift reports, rewrite execution
            reports, and rewrite continuity ledger entries for this book.
          </Text>
          <Alert color="red">
            Original manuscript text, chapters, scenes, paragraphs, Manuscript Blueprint, summaries, Critic reports, and
            uploaded files are kept.
          </Alert>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label='Type "RESET REWRITE" to confirm'
            value={confirmation}
            onChange={(event) => setConfirmation(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" color="dark" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button color="red" loading={loading} disabled={!canReset} onClick={resetRewrite}>
              Reset Rewrite Work
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
