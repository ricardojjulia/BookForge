"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";

export function DeleteBookButton({
  bookId,
  bookTitle,
  redirectTo = "/dashboard",
  size = "sm",
}: {
  bookId: string;
  bookTitle: string;
  redirectTo?: string;
  size?: "xs" | "sm" | "md";
}) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canDelete = confirmation.trim() === bookTitle.trim();

  async function deleteBook() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.from("books").delete().eq("id", bookId);
      if (deleteError) throw deleteError;
      setOpened(false);
      setConfirmation("");
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete book.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        color="red"
        variant="subtle"
        size={size}
        leftSection={<IconTrash size={16} />}
        onClick={() => setOpened(true)}
      >
        Delete
      </Button>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Delete book" centered>
        <Stack>
          <Text>
            This will permanently delete <strong>{bookTitle}</strong> and its chapters, scenes, paragraphs, Manuscript Blueprint,
            reports, and saved inputs.
          </Text>
          <Alert color="red">Original manuscript records for this book will be removed from the local database.</Alert>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label={`Type "${bookTitle}" to confirm`}
            value={confirmation}
            onChange={(event) => setConfirmation(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" color="dark" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button color="red" loading={loading} disabled={!canDelete} onClick={deleteBook}>
              Delete Book
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
