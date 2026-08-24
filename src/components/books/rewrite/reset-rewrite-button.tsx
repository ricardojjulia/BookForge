"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";

type ResetPreview = { revisionVersions: number; rewriteJobs: number; acceptedParagraphs: number };

export function ResetRewriteButton({ bookId, size = "sm" }: { bookId: string; size?: "xs" | "sm" | "md" }) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const canReset = confirmation.trim() === "RESET REWRITE" && !previewLoading;

  async function openModal() {
    setOpened(true);
    setPreview(null);
    setPreviewLoading(true);
    try {
      const result = await fetchJson<{ content?: ResetPreview }>(`/api/books/${bookId}/rewrite-reset`, {}, "Load reset preview");
      setPreview(result.content || { revisionVersions: 0, rewriteJobs: 0, acceptedParagraphs: 0 });
    } catch {
      // Non-fatal: the confirm button just stays disabled via previewLoading
      // rather than letting someone confirm without ever seeing real counts.
    } finally {
      setPreviewLoading(false);
    }
  }

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
        onClick={() => { void openModal(); }}
      >
        Reset Rewrite Work
      </Button>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Reset rewrite work" centered>
        <Stack>
          <Alert color="red" title="This erases accepted rewritten text, not just drafts">
            {previewLoading
              ? "Checking how much work this would erase…"
              : preview
                ? preview.acceptedParagraphs > 0
                  ? `${preview.acceptedParagraphs} paragraph(s) currently have accepted rewritten text. Resetting reverts every one of them to having no rewritten text at all -- only the original, pre-rewrite manuscript survives. This cannot be undone.`
                  : "No paragraphs currently have accepted rewritten text, so this mainly clears out draft suggestions and jobs."
                : "Unable to load an exact count -- proceed only if you're sure, since this cannot be undone."}
          </Alert>
          <Text size="sm">
            Also deletes all {preview ? `${preview.revisionVersions} ` : ""}rewrite draft/accepted versions,{" "}
            {preview ? `${preview.rewriteJobs} ` : ""}rewrite job(s), rewrite drift reports, rewrite execution reports, and
            rewrite continuity ledger entries for this book.
          </Text>
          <Text size="sm" c="dimmed">
            Kept: the original (pre-rewrite) manuscript text, chapters, scenes, and paragraphs as originally
            written/imported, plus the Manuscript Blueprint, chapter summaries, Critic reports, and uploaded files.
          </Text>
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
