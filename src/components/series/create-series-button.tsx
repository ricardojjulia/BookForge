"use client";

import { useState } from "react";
import { Button, Modal, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";

export function CreateSeriesButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJson<{ series: { id: string } }>("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined }),
      });
      router.push(`/series/${res.series.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
      setLoading(false);
    }
  }

  return (
    <>
      <Button color="grape" onClick={() => setOpen(true)}>New Series</Button>
      <Modal opened={open} onClose={() => setOpen(false)} title="Create Series">
        <Stack gap="sm">
          <TextInput label="Series title" required value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} minRows={2} />
          {error && <Text c="red" size="sm">{error}</Text>}
          <Button color="grape" loading={loading} disabled={!title.trim()} onClick={create}>Create</Button>
        </Stack>
      </Modal>
    </>
  );
}
