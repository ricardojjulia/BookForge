"use client";

import { useMemo, useState } from "react";
import { Alert, Badge, Button, Checkbox, Group, Modal, Paper, Select, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http/fetch-json";
import { RewritePlanActions } from "@/components/books/rewrite/rewrite-plan-actions";
import { runServerManagedJob } from "@/lib/rewrite/run-server-managed-job";
import { auditBookStructure, type StructureAuditChapter, type StructureAuditParagraph } from "@/lib/structure/audit";

type ChapterMetadata = StructureAuditChapter & {
  summary?: string | null;
};

// Which single action is in flight, if any. Scoped per-action rather than
// one shared boolean so running Expand doesn't visually freeze every other
// button in this modal (including Save) for its whole duration.
type ActiveAction = "delete" | "draft" | "expand" | "shorten" | "merge" | "save" | null;

// rewrite-execute only ever creates pending revision_versions drafts -- it
// never writes paragraphs.accepted_text itself (that's a deliberate separate
// step elsewhere, e.g. the reviewable Revisions page). Expand/Shorten here
// have no review step of their own, so without this the chapter's rewrite
// silently never reaches the manuscript no matter how many times you click.
async function acceptChapterRevisions(bookId: string, chapterId: string) {
  const result = await fetchJson<{ content?: { accepted?: number } }>(
    `/api/books/${bookId}/revisions/accept-all`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chapterId }),
    },
    "Apply chapter rewrite",
  );
  return result.content?.accepted || 0;
}

function describeJobProgress(job: { progress: { currentUnit?: string | null; totalUnits?: number; attempted?: number } | null }) {
  const totalUnits = job.progress?.totalUnits || 0;
  const attempted = job.progress?.attempted || 0;
  const currentUnit = job.progress?.currentUnit || "Working";
  return totalUnits > 1 ? `${currentUnit} (${attempted}/${totalUnits})` : currentUnit;
}

export function ChapterMetadataPanel({
  bookId,
  chapters,
  paragraphs,
}: {
  bookId: string;
  chapters: ChapterMetadata[];
  paragraphs: StructureAuditParagraph[];
}) {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);
  const [selectedId, setSelectedId] = useState(chapters[0]?.id || "");
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [progressText, setProgressText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [repairsApplied, setRepairsApplied] = useState<string[]>([]);
  const loading = activeAction !== null;
  const issues = useMemo(() => auditBookStructure(chapters, paragraphs), [chapters, paragraphs]);
  const sortedChapters = useMemo(() => [...chapters].sort((a, b) => a.chapter_number - b.chapter_number), [chapters]);
  const selected = chapters.find((chapter) => chapter.id === selectedId) || chapters[0] || null;
  const selectedIssues = selected ? issues.filter((issue) => issue.chapterId === selected.id) : [];
  const hasIssueType = (prefix: string) => selectedIssues.some((issue) => issue.id.startsWith(prefix));
  const expandBlockedByParagraphCount = selectedIssues.some(
    (issue) => (issue.id.startsWith("short-") || issue.id.startsWith("empty-")) && issue.blockedByParagraphCount,
  );
  const nextChapter = selected
    ? sortedChapters.find((chapter) => chapter.chapter_number > selected.chapter_number) || null
    : null;

  async function deleteChapter() {
    if (!selected) return;
    setActiveAction("delete");
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
      setActiveAction(null);
    }
  }

  async function generateChapterDraft() {
    if (!selected) return;
    setActiveAction("draft");
    setMessage("");
    setError("");
    try {
      const result = await fetchJson<{ content?: { generated?: number; message?: string } }>(
        `/api/books/${bookId}/generate-draft`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chapterId: selected.id }),
        },
        "Generate chapter draft",
      );
      const generated = result.content?.generated || 0;
      if (generated > 0) {
        setRepairsApplied((prev) => [...prev, `Generated a draft for Chapter ${selected.chapter_number}`]);
      } else {
        setError(result.content?.message || "No draft was generated — this chapter may not be eligible for draft generation.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate this chapter.");
    } finally {
      setActiveAction(null);
    }
  }

  async function expandChapter() {
    if (!selected) return;
    setActiveAction("expand");
    setProgressText("Queuing chapter rewrite...");
    setMessage("");
    setError("");
    try {
      const job = await runServerManagedJob(
        bookId,
        `/api/books/${bookId}/rewrite-execute`,
        {
          chapterId: selected.id,
          strategyId: "creative_enhancement",
          rewriteExistingDrafts: true,
          rewriteAccepted: true,
          forceTinyParagraphs: true,
        },
        "Expand chapter",
        (row) => setProgressText(describeJobProgress(row)),
      );
      const rewritten = job.progress?.successful || 0;
      if (rewritten > 0) {
        setProgressText("Applying rewritten paragraphs...");
        const applied = await acceptChapterRevisions(bookId, selected.id);
        setRepairsApplied((prev) => [...prev, `Expanded Chapter ${selected.chapter_number} (${applied} paragraph(s) rewritten and applied)`]);
      } else {
        setError(
          `No paragraphs were rewritten (${job.progress?.attempted || 0} attempted, ${job.progress?.skipped || 0} skipped). This chapter may have no eligible paragraphs, or generate a Rewrite Architect plan first.`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to expand this chapter.");
    } finally {
      setActiveAction(null);
      setProgressText("");
    }
  }

  async function shortenChapter() {
    if (!selected) return;
    setActiveAction("shorten");
    setProgressText("Queuing chapter rewrite...");
    setMessage("");
    setError("");
    try {
      const job = await runServerManagedJob(
        bookId,
        `/api/books/${bookId}/rewrite-execute`,
        {
          chapterId: selected.id,
          strategyId: "downsize_abridge",
          rewriteExistingDrafts: true,
          rewriteAccepted: true,
        },
        "Shorten chapter",
        (row) => setProgressText(describeJobProgress(row)),
      );
      const rewritten = job.progress?.successful || 0;
      if (rewritten > 0) {
        setProgressText("Applying rewritten paragraphs...");
        const applied = await acceptChapterRevisions(bookId, selected.id);
        setRepairsApplied((prev) => [...prev, `Shortened Chapter ${selected.chapter_number} (${applied} paragraph(s) rewritten and applied)`]);
      } else {
        setError(
          `No paragraphs were rewritten (${job.progress?.attempted || 0} attempted, ${job.progress?.skipped || 0} skipped). This chapter may have no eligible paragraphs, or generate a Rewrite Architect plan first.`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to shorten this chapter.");
    } finally {
      setActiveAction(null);
      setProgressText("");
    }
  }

  async function mergeChapter() {
    if (!selected) return;
    setActiveAction("merge");
    setMessage("");
    setError("");
    try {
      await fetchJson(`/api/chapters/${selected.id}/merge-next`, { method: "PATCH" }, "Merge chapter");
      setRepairsApplied((prev) => [
        ...prev,
        `Merged Chapter ${selected.chapter_number}${nextChapter ? ` with "${nextChapter.title || `Chapter ${nextChapter.chapter_number}`}"` : ""}`,
      ]);
      setConfirmMerge(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to merge this chapter.");
    } finally {
      setActiveAction(null);
    }
  }

  async function saveChapter(formData: FormData) {
    if (!selected) return;
    setActiveAction("save");
    setMessage("");
    setError("");
    try {
      const hasRepairs = repairsApplied.length > 0;
      const result = await fetchJson<{ content?: { invalidatedCount?: number } }>(
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
            invalidateBookEvaluations: hasRepairs,
          }),
        },
        "Update chapter metadata",
      );
      const invalidatedCount = result.content?.invalidatedCount || 0;
      setMessage(
        hasRepairs
          ? `Chapter repairs saved. Cleared ${invalidatedCount} stale book-wide evaluation${invalidatedCount === 1 ? "" : "s"} (critic scores, rewrite plan, drift/continuity reports) — rerun them before trusting downstream work.`
          : "Chapter metadata saved. Summary was cleared so it can be regenerated.",
      );
      setRepairsApplied([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save chapter metadata.");
    } finally {
      setActiveAction(null);
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
                  <div key={issue.id}>
                    <Text size="sm" fw={700}>
                      {issue.title}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {issue.description}
                    </Text>
                  </div>
                ))
              )}
            </Paper>
          </Group>

          {selected && (hasIssueType("empty-") || hasIssueType("planned-") || hasIssueType("short-") || hasIssueType("long-") || nextChapter) && (
            <Paper withBorder radius="md" p="md" bg="#f8fff4">
              <Text fw={800} mb="xs">
                Repair actions for this chapter
              </Text>
              <Group gap="xs">
                {hasIssueType("planned-") && (
                  <Button
                    size="xs"
                    color="teal"
                    variant="light"
                    loading={activeAction === "draft"}
                    disabled={loading && activeAction !== "draft"}
                    onClick={generateChapterDraft}
                  >
                    Generate chapter draft
                  </Button>
                )}
                {(hasIssueType("short-") || hasIssueType("empty-")) && !expandBlockedByParagraphCount && (
                  <Button
                    size="xs"
                    color="teal"
                    variant="light"
                    loading={activeAction === "expand"}
                    disabled={loading && activeAction !== "expand"}
                    onClick={expandChapter}
                  >
                    Expand this chapter
                  </Button>
                )}
                {hasIssueType("long-") && (
                  <Button
                    size="xs"
                    color="teal"
                    variant="light"
                    loading={activeAction === "shorten"}
                    disabled={loading && activeAction !== "shorten"}
                    onClick={shortenChapter}
                  >
                    Shorten this chapter
                  </Button>
                )}
                {nextChapter &&
                  (hasIssueType("short-") || hasIssueType("empty-") || hasIssueType("planned-") || hasIssueType("repeat-title")) &&
                  (confirmMerge ? (
                    <Group gap="xs">
                      <Text size="sm" c="red" fw={700}>
                        Merge into &quot;{nextChapter.title || `Chapter ${nextChapter.chapter_number}`}&quot;? This chapter&apos;s text will be combined and it will no longer exist on its own.
                      </Text>
                      <Button size="xs" color="red" loading={activeAction === "merge"} disabled={loading && activeAction !== "merge"} onClick={mergeChapter}>
                        Yes, merge
                      </Button>
                      <Button size="xs" variant="subtle" color="dark" onClick={() => setConfirmMerge(false)}>
                        Cancel
                      </Button>
                    </Group>
                  ) : (
                    <Button size="xs" color="orange" variant="light" disabled={loading} onClick={() => setConfirmMerge(true)}>
                      Merge with next chapter
                    </Button>
                  ))}
              </Group>
              {(activeAction === "expand" || activeAction === "shorten") && progressText && (
                <Text size="xs" c="teal" fw={600} mt={6}>
                  {progressText}
                </Text>
              )}
              {expandBlockedByParagraphCount ? (
                <Text size="xs" c="orange" fw={600} mt={6}>
                  This chapter has too few paragraphs for Expand to fix — lengthening existing text can&apos;t add paragraphs. Merge is the only
                  repair action available for this issue.
                </Text>
              ) : (
                <>
                  <Text size="xs" c="dimmed" mt={6}>
                    Expand/shorten use the saved Rewrite Architect plan and run as a real rewrite pass — they need a plan generated first.
                  </Text>
                  <Paper withBorder radius="sm" p="sm" mt="xs" bg="white">
                    <Text size="xs" fw={700} mb={4}>
                      No plan yet, or it&apos;s stale? Generate one here, then retry Expand/Shorten above.
                    </Text>
                    <RewritePlanActions bookId={bookId} />
                  </Paper>
                </>
              )}
              {repairsApplied.length > 0 && (
                <Stack gap={2} mt="sm">
                  <Text size="sm" fw={700} c="teal">
                    Repairs applied this session — click Save below to commit and reset stale evaluations:
                  </Text>
                  {repairsApplied.map((label, i) => (
                    <Text size="sm" key={i}>
                      ✓ {label}
                    </Text>
                  ))}
                </Stack>
              )}
            </Paper>
          )}

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
                      <Button size="xs" color="red" loading={activeAction === "delete"} disabled={loading && activeAction !== "delete"} onClick={deleteChapter}>
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
                  <Stack gap={2} align="flex-end">
                    <Button color="grape" loading={activeAction === "save"} disabled={loading && activeAction !== "save"} type="submit">
                      {repairsApplied.length > 0 ? "Save & Apply Repairs" : "Save Chapter Metadata"}
                    </Button>
                    <Text size="xs" c="dimmed" ta="right" maw={260}>
                      {repairsApplied.length > 0
                        ? "Repairs above already ran — this saves title/notes and clears stale scores so you know to rerun them."
                        : "Saves title, section type, and notes only — it does not rewrite chapter text."}
                    </Text>
                  </Stack>
                </Group>
              </Stack>
            </form>
          )}
        </Stack>
      </Modal>
    </Paper>
  );
}
