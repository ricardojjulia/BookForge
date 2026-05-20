"use client";

import { useMemo, useState } from "react";
import { Alert, Badge, Button, Checkbox, Group, Modal, Paper, Select, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";
import { auditBookStructure, type StructureAuditChapter, type StructureAuditParagraph } from "@/lib/structure/audit";

type ChapterMetadata = StructureAuditChapter & {
  summary?: string | null;
};

export function ChapterMetadataPanel({
  chapters,
  paragraphs,
}: {
  chapters: ChapterMetadata[];
  paragraphs: StructureAuditParagraph[];
}) {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);
  const [selectedId, setSelectedId] = useState(chapters[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const issues = useMemo(() => auditBookStructure(chapters, paragraphs), [chapters, paragraphs]);
  const selected = chapters.find((chapter) => chapter.id === selectedId) || chapters[0] || null;
  const selectedIssues = selected ? issues.filter((issue) => issue.chapterId === selected.id) : [];

  async function deleteChapter() {
    if (!selected) return;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      await fetchJson(`/api/chapters/${selected.id}`, { method: "DELETE" }, "Delete chapter");
      setConfirmDelete(false);
      const next = chapters.find((c) => c.id !== selected.id);
      setSelectedId(next?.id || "");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete chapter.");
    } finally {
      setLoading(false);
    }
  }

  async function saveChapter(formData: FormData) {
    if (!selected) return;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      await fetchJson(
        `/api/chapters/${selected.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: String(formData.get("title") || ""),
            sectionType: String(formData.get("sectionType") || "body"),
            excludeFromRewrite: formData.get("excludeFromRewrite") === "on",
            excludeFromExport: formData.get("excludeFromExport") === "on",
            structureNotes: String(formData.get("structureNotes") || ""),
            clearSummary: true,
          }),
        },
        "Update chapter metadata",
      );
      setMessage("Chapter metadata saved. Summary was cleared so it can be regenerated.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save chapter metadata.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Structure Repair Assistant</Title>
          <Text c="dimmed" size="sm">
            Repair chapter labels and import artifacts before rewrite, Critic, or export work.
          </Text>
        </div>
        <Group gap="xs">
          <Badge color={issues.length ? "yellow" : "green"} variant="light">
            {issues.length ? `${issues.length} warnings` : "structure clean"}
          </Badge>
          <Button color="dark" variant="light" onClick={open}>
            Repair Chapters
          </Button>
        </Group>
      </Group>

      {issues.length > 0 && (
        <Stack gap="xs" mt="md">
          {issues.slice(0, 5).map((issue) => (
            <Alert key={issue.id} color={issue.severity === "high" ? "red" : "yellow"} variant="light">
              <Text fw={800} size="sm">
                {issue.chapterNumber ? `Chapter ${issue.chapterNumber}: ` : ""}{issue.title}
              </Text>
              <Text size="sm">{issue.description}</Text>
            </Alert>
          ))}
        </Stack>
      )}

      <Modal opened={opened} onClose={close} title="Chapter Repair and Metadata" size="75rem" centered>
        <Stack>
          {message && <Alert color="green">{message}</Alert>}
          {error && <Alert color="red">{error}</Alert>}
          <Alert color="blue" variant="light">
            Metadata changes do not delete original text. Excluding a chapter from rewrite/export only changes how BookForge uses it.
          </Alert>
          <Group align="flex-start" grow>
            <Select
              label="Chapter"
              value={selected?.id || ""}
              onChange={(value) => { setSelectedId(value || ""); setConfirmDelete(false); }}
              data={chapters.map((chapter) => ({
                value: chapter.id,
                label: `${chapter.chapter_number}. ${chapter.title || "Untitled"}`,
              }))}
              searchable
            />
            <Paper withBorder radius="md" p="md" bg="#fffdf8">
              <Text fw={800}>Detected issues</Text>
              {!selectedIssues.length ? (
                <Text size="sm" c="dimmed">
                  No specific warning for this chapter.
                </Text>
              ) : (
                selectedIssues.map((issue) => (
                  <Text key={issue.id} size="sm">
                    {issue.title}
                  </Text>
                ))
              )}
            </Paper>
          </Group>

          {selected && (
            <form action={saveChapter}>
              <Stack>
                <TextInput name="title" label="Chapter title" defaultValue={selected.title || ""} />
                <Select
                  name="sectionType"
                  label="Section type"
                  defaultValue={selected.section_type || "body"}
                  data={[
                    { value: "front_matter", label: "Front matter" },
                    { value: "body", label: "Body chapter" },
                    { value: "back_matter", label: "Back matter" },
                  ]}
                />
                <Group>
                  <Checkbox
                    name="excludeFromRewrite"
                    defaultChecked={Boolean(selected.exclude_from_rewrite)}
                    label="Exclude from rewrite"
                  />
                  <Checkbox
                    name="excludeFromExport"
                    defaultChecked={Boolean(selected.exclude_from_export)}
                    label="Exclude from export"
                  />
                </Group>
                <Textarea
                  name="structureNotes"
                  label="Structure notes"
                  defaultValue={selected.structure_notes || ""}
                  autosize
                  minRows={3}
                />
                <Group justify="space-between">
                  {confirmDelete ? (
                    <Group gap="xs">
                      <Text size="sm" c="red" fw={700}>
                        Permanently delete this chapter?
                      </Text>
                      <Button size="xs" color="red" loading={loading} onClick={deleteChapter}>
                        Yes, delete
                      </Button>
                      <Button size="xs" variant="subtle" color="dark" onClick={() => setConfirmDelete(false)}>
                        Cancel
                      </Button>
                    </Group>
                  ) : (
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      disabled={loading}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete chapter
                    </Button>
                  )}
                  <Button color="grape" loading={loading} type="submit">
                    Save Chapter Metadata
                  </Button>
                </Group>
              </Stack>
            </form>
          )}
        </Stack>
      </Modal>
    </Paper>
  );
}
