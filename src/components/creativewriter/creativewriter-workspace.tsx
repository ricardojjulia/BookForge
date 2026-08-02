"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { ActionIcon, Alert, Badge, Button, Container, Divider, Group, Paper, ScrollArea, SegmentedControl, Stack, Tabs, Text, Textarea, TextInput, Title, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBook, IconCheck, IconCloudDown, IconCloudUp, IconGitMerge, IconMapPin, IconMessage, IconNotes, IconPalette, IconPin, IconPinFilled, IconRefresh, IconSearch, IconSparkles, IconUsers, IconWriting, IconX } from "@tabler/icons-react";
import { versionFromDate, type CreativeWriterConflictView, type CreativeWriterWorkspaceData } from "@/lib/creativewriter-ui/dashboard";
import { CREATIVEWRITER_RELEASE_LABEL } from "@/lib/creativewriter-ui/version";
import type { CreativeWriterCloudChange } from "@/lib/creativewriter-sync";

type SyncMessage = {
  tone: "green" | "yellow" | "red" | "blue";
  text: string;
};

type SupportEntryKind = "note" | "timeline" | "research" | "bible" | "character" | "location" | "theme" | "motif" | "comment";

type SupportEntry = {
  id: string;
  kind: SupportEntryKind;
  title: string;
  text: string;
  detail?: string | null;
  badge?: string | null;
};

type WorkspaceLayout = {
  left: number;
  right: number;
};

type CommentReviewFilter = "open" | "all" | "resolved";

const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = { left: 280, right: 320 };
const MIN_LEFT_WIDTH = 220;
const MIN_EDITOR_WIDTH = 420;
const MIN_RIGHT_WIDTH = 260;
const RESIZE_HANDLE_WIDTH = 10;
const SUPPORT_TAB_STYLE: CSSProperties = { flex: "1 1 116px", minWidth: 0 };

export function CreativeWriterWorkspace({ initialData }: { initialData: CreativeWriterWorkspaceData }) {
  return <CreativeWriterWorkspaceState key={initialData.selectedBook?.id || "no-book"} initialData={initialData} />;
}

function CreativeWriterWorkspaceState({ initialData }: { initialData: CreativeWriterWorkspaceData }) {
  const workspaceGridRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState(initialData);
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayout>(() => loadWorkspaceLayout());
  const [selectedChapterId, setSelectedChapterId] = useState(data.chapters[0]?.id || "");
  const selectedChapter = data.chapters.find((chapter) => chapter.id === selectedChapterId) || data.chapters[0] || null;
  const chapterParagraphs = useMemo(
    () => data.paragraphs.filter((paragraph) => paragraph.chapterId === selectedChapter?.id),
    [data.paragraphs, selectedChapter?.id],
  );
  const [selectedParagraphId, setSelectedParagraphId] = useState(chapterParagraphs[0]?.id || data.paragraphs[0]?.id || "");
  const selectedParagraph = data.paragraphs.find((paragraph) => paragraph.id === selectedParagraphId) || chapterParagraphs[0] || data.paragraphs[0] || null;
  const [draftText, setDraftText] = useState(selectedParagraph?.currentText || selectedParagraph?.acceptedText || "");
  const [conflictDrafts, setConflictDrafts] = useState<Record<string, string>>({});
  const [supportSearch, setSupportSearch] = useState("");
  const [commentReviewFilter, setCommentReviewFilter] = useState<CommentReviewFilter>("open");
  const [pinnedSupportIds, setPinnedSupportIds] = useState<string[]>(() => loadPinnedSupportIds(initialData.selectedBook?.id || ""));
  const [message, setMessage] = useState<SyncMessage | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = selectedParagraph ? draftText !== (selectedParagraph.currentText || selectedParagraph.acceptedText || "") : false;
  const totalWords = useMemo(() => countWords(data.paragraphs.map((paragraph) => paragraph.currentText || paragraph.acceptedText || "").join(" ")), [data.paragraphs]);
  const chapterWords = useMemo(() => countWords(chapterParagraphs.map((paragraph) => paragraph.currentText || paragraph.acceptedText || "").join(" ")), [chapterParagraphs]);
  const commentsByParagraph = useMemo(() => groupReaderCommentsByParagraph(data.readerComments), [data.readerComments]);
  const selectedParagraphComments = selectedParagraph ? commentsByParagraph[selectedParagraph.id] || [] : [];
  const commentParagraphNumbers = useMemo(() => new Map(data.paragraphs.map((paragraph) => [paragraph.id, paragraph.paragraphNumber])), [data.paragraphs]);
  const openCommentCount = useMemo(() => data.readerComments.filter((comment) => !comment.resolved).length, [data.readerComments]);
  const resolvedCommentCount = data.readerComments.length - openCommentCount;
  const supportEntries = useMemo(() => buildSupportEntries(data), [data]);
  const pinnedSupportEntries = useMemo(
    () => pinnedSupportIds.flatMap((id) => supportEntries.find((entry) => entry.id === id) || []),
    [pinnedSupportIds, supportEntries],
  );
  const noteEntries = useMemo(() => filterSupportEntries(supportEntries.filter((entry) => entry.kind === "note" || entry.kind === "timeline"), supportSearch), [supportEntries, supportSearch]);
  const researchEntries = useMemo(() => filterSupportEntries(supportEntries.filter((entry) => entry.kind === "research"), supportSearch), [supportEntries, supportSearch]);
  const commentEntries = useMemo(() => filterSupportEntries(supportEntries.filter((entry) => entry.kind === "comment"), supportSearch), [supportEntries, supportSearch]);
  const bibleSummaryEntries = useMemo(() => filterSupportEntries(supportEntries.filter((entry) => entry.kind === "bible"), supportSearch), [supportEntries, supportSearch]);
  const characterEntries = useMemo(() => filterSupportEntries(supportEntries.filter((entry) => entry.kind === "character"), supportSearch), [supportEntries, supportSearch]);
  const locationEntries = useMemo(() => filterSupportEntries(supportEntries.filter((entry) => entry.kind === "location"), supportSearch), [supportEntries, supportSearch]);
  const themeEntries = useMemo(() => filterSupportEntries(supportEntries.filter((entry) => entry.kind === "theme"), supportSearch), [supportEntries, supportSearch]);
  const motifEntries = useMemo(() => filterSupportEntries(supportEntries.filter((entry) => entry.kind === "motif"), supportSearch), [supportEntries, supportSearch]);
  const reviewComments = useMemo(
    () => filterReaderComments(data.readerComments, supportSearch, commentReviewFilter, commentParagraphNumbers),
    [commentParagraphNumbers, commentReviewFilter, data.readerComments, supportSearch],
  );

  useEffect(() => {
    savePinnedSupportIds(data.selectedBook?.id || "", pinnedSupportIds);
  }, [data.selectedBook?.id, pinnedSupportIds]);

  useEffect(() => {
    saveWorkspaceLayout(workspaceLayout);
  }, [workspaceLayout]);

  function updateWorkspaceLayout(updater: (current: WorkspaceLayout, containerWidth: number) => WorkspaceLayout) {
    setWorkspaceLayout((current) => {
      const containerWidth = workspaceGridRef.current?.getBoundingClientRect().width || 1200;
      return clampWorkspaceLayout(updater(current, containerWidth), containerWidth);
    });
  }

  function startColumnResize(handle: "left" | "right", event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startLayout = workspaceLayout;
    const containerWidth = workspaceGridRef.current?.getBoundingClientRect().width || 1200;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setWorkspaceLayout(
        clampWorkspaceLayout(
          handle === "left"
            ? { ...startLayout, left: startLayout.left + delta }
            : { ...startLayout, right: startLayout.right - delta },
          containerWidth,
        ),
      );
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function resizeColumnWithKeyboard(handle: "left" | "right", event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 40 : 16;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    updateWorkspaceLayout((current) => {
      if (handle === "left") {
        return { ...current, left: current.left + (event.key === "ArrowRight" ? step : -step) };
      }
      return { ...current, right: current.right + (event.key === "ArrowLeft" ? step : -step) };
    });
  }

  function selectChapter(chapterId: string) {
    if (!canLeaveDraft()) return;
    const nextParagraph = data.paragraphs.find((paragraph) => paragraph.chapterId === chapterId) || null;
    setSelectedChapterId(chapterId);
    setSelectedParagraphId(nextParagraph?.id || "");
    setDraftText(nextParagraph?.currentText || nextParagraph?.acceptedText || "");
  }

  function selectParagraph(paragraphId: string) {
    if (!canLeaveDraft()) return;
    const paragraph = data.paragraphs.find((item) => item.id === paragraphId) || null;
    setSelectedParagraphId(paragraphId);
    setDraftText(paragraph?.currentText || paragraph?.acceptedText || "");
  }

  function selectCommentParagraph(paragraphId: string | null) {
    if (!paragraphId) return;
    if (!canLeaveDraft()) return;
    const paragraph = data.paragraphs.find((item) => item.id === paragraphId) || null;
    if (!paragraph) {
      setMessage({ tone: "yellow", text: "That comment is not attached to an available paragraph." });
      return;
    }
    setSelectedChapterId(paragraph.chapterId);
    setSelectedParagraphId(paragraph.id);
    setDraftText(paragraph.currentText || paragraph.acceptedText || "");
  }

  function canLeaveDraft() {
    if (!dirty) return true;
    setMessage({ tone: "yellow", text: "Push or discard the current draft before switching paragraphs." });
    return false;
  }

  function discardDraft() {
    setDraftText(selectedParagraph?.currentText || selectedParagraph?.acceptedText || "");
    setMessage({ tone: "blue", text: "Local draft discarded." });
  }

  function pushDraft() {
    if (!data.project || !selectedParagraph) return;
    const project = data.project;
    const now = new Date().toISOString();
    const idSuffix = `${selectedParagraph.id}-${Date.now()}`;
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/creativewriter/sync/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project,
          changes: [
            {
              id: `cw-ui-${idSuffix}`,
              projectId: project.localProjectId,
              entityType: "paragraph",
              entityId: selectedParagraph.id,
              operation: "update",
              payload: { currentText: draftText },
              baseVersion: versionFromDate(selectedParagraph.updatedAt),
              localVersion: versionFromDate(selectedParagraph.updatedAt) + 1,
              idempotencyKey: `cw-ui-${idSuffix}`,
              createdAt: now,
            },
          ],
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        setMessage({ tone: "red", text: payload.error || "Push failed." });
        return;
      }

      const conflicts = payload.content?.conflicts || [];
      if (conflicts.length) {
        setMessage({ tone: "yellow", text: "Cloud changed first. Review the conflict before applying your draft." });
        notifications.show({ color: "yellow", title: "Conflict created", message: "Refresh to load the persisted conflict." });
        return;
      }

      setData((current) => ({
        ...current,
        project: payload.content?.project || current.project,
        paragraphs: current.paragraphs.map((paragraph) =>
          paragraph.id === selectedParagraph.id
            ? { ...paragraph, currentText: draftText, updatedAt: new Date().toISOString() }
            : paragraph,
        ),
      }));
      setMessage({ tone: "green", text: "Draft pushed to BookForge Cloud." });
    });
  }

  function pullSnapshot() {
    if (!data.selectedBook || !data.project) return;
    if (dirty) {
      setMessage({ tone: "yellow", text: "Push or discard the current draft before pulling cloud changes." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/creativewriter/sync/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookId: data.selectedBook?.id,
          localProjectId: data.project?.localProjectId,
          sinceCursor: data.project?.syncCursor,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        setMessage({ tone: "red", text: payload.error || "Pull failed." });
        return;
      }
      const changes = (payload.content?.changes || []) as CreativeWriterCloudChange[];
      const nextData = mergeCloudChanges(data, changes, payload.content?.project || data.project);
      const nextParagraph = nextData.paragraphs.find((paragraph) => paragraph.id === selectedParagraphId) || null;
      setData(nextData);
      setDraftText(nextParagraph?.currentText || nextParagraph?.acceptedText || "");
      setMessage({ tone: "blue", text: `Pulled and merged ${changes.length} cloud changes.` });
    });
  }

  function resolveConflict(conflict: CreativeWriterConflictView, resolution: "resolved_cloud" | "resolved_local" | "resolved_manual") {
    if (!data.project) return;
    const resolvedPayload = resolution === "resolved_manual" ? buildManualResolutionPayload(conflict, conflictDrafts[conflict.id]) : undefined;
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/creativewriter/sync/resolve-conflict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project: data.project,
          conflictId: conflict.id,
          resolution,
          ...(resolvedPayload ? { resolvedPayload } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        setMessage({ tone: "red", text: payload.error || "Resolution failed." });
        return;
      }
      setData((current) => ({
        ...current,
        project: current.project ? { ...current.project, syncCursor: payload.content.syncCursor, lastCloudVersion: payload.content.cloudVersion } : current.project,
        conflicts: current.conflicts.filter((item) => item.id !== conflict.id),
      }));
      setConflictDrafts((current) => {
        const next = { ...current };
        delete next[conflict.id];
        return next;
      });
      setMessage({ tone: "green", text: "Conflict resolved in the cloud ledger." });
    });
  }

  function updateReaderCommentResolution(commentId: string, resolved: boolean) {
    if (!data.selectedBook) return;
    const bookId = data.selectedBook.id;
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/books/${bookId}/annotations/${commentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolved }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        setMessage({ tone: "red", text: payload.error || "Comment update failed." });
        return;
      }
      setData((current) => ({
        ...current,
        readerComments: current.readerComments.map((comment) => (comment.id === commentId ? { ...comment, resolved } : comment)),
      }));
      setMessage({ tone: "green", text: resolved ? "Reader comment marked resolved." : "Reader comment reopened." });
    });
  }

  function togglePinnedSupport(entryId: string) {
    setPinnedSupportIds((current) => (current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId]));
  }

  function clearSupportSearch() {
    setSupportSearch("");
  }

  return (
    <Container size="xl" py="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs" mb="xs">
              <Badge color="dark" variant="filled">Internal Prototype</Badge>
              <Badge color="grape" variant="light">{CREATIVEWRITER_RELEASE_LABEL}</Badge>
              <Badge color={data.conflicts.length ? "yellow" : "teal"} variant="light">
                {data.conflicts.length} conflicts
              </Badge>
            </Group>
            <Title>BookForge CreativeWriter</Title>
            <Text c="dimmed">Focused writing desk for linked BookForge manuscripts.</Text>
          </div>
          <Group>
            <Button leftSection={<IconCloudDown size={16} />} variant="light" color="dark" loading={isPending} onClick={pullSnapshot} disabled={!data.project}>
              Pull
            </Button>
            <Button leftSection={<IconRefresh size={16} />} component={Link} href={`/creativewriter${data.selectedBook ? `?bookId=${data.selectedBook.id}` : ""}`} variant="light" color="grape">
              Refresh
            </Button>
          </Group>
        </Group>

        {message && <Alert color={message.tone}>{message.text}</Alert>}

        {!data.selectedBook ? (
          <Paper withBorder radius="md" p="xl" bg="white">
            <Title order={3}>No books available</Title>
            <Text c="dimmed" mt="xs">Import or create a book before opening CreativeWriter.</Text>
            <Button component={Link} href="/books/new" color="grape" mt="md">Import Manuscript</Button>
          </Paper>
        ) : (
          <div
            ref={workspaceGridRef}
            className="grid overflow-x-auto"
            style={{
              gridTemplateColumns: `${workspaceLayout.left}px ${RESIZE_HANDLE_WIDTH}px minmax(${MIN_EDITOR_WIDTH}px, 1fr) ${RESIZE_HANDLE_WIDTH}px ${workspaceLayout.right}px`,
            }}
          >
            <Paper withBorder radius="md" p="md" bg="white">
              <Stack gap="md">
                <div>
                  <Text size="sm" fw={700} mb="xs">Books</Text>
                  <Stack gap={6}>
                    {data.books.map((book) => (
                      <Button key={book.id} component={Link} href={`/creativewriter?bookId=${book.id}`} variant={book.id === data.selectedBook?.id ? "filled" : "subtle"} color={book.id === data.selectedBook?.id ? "grape" : "dark"} justify="flex-start" fullWidth>
                        {book.title}
                      </Button>
                    ))}
                  </Stack>
                </div>
                <Divider />
                <div>
                  <Text size="sm" fw={700} mb="xs">Chapters</Text>
                  <ScrollArea h={420}>
                    <Stack gap={6}>
                      {data.chapters.map((chapter) => (
                        <Button key={chapter.id} variant={chapter.id === selectedChapter?.id ? "light" : "subtle"} color="dark" justify="flex-start" fullWidth onClick={() => selectChapter(chapter.id)}>
                          {chapter.chapterNumber}. {chapter.title || "Untitled"}
                        </Button>
                      ))}
                    </Stack>
                  </ScrollArea>
                </div>
              </Stack>
            </Paper>

            <ColumnResizeHandle
              ariaLabel="Resize books panel"
              onPointerDown={(event) => startColumnResize("left", event)}
              onKeyDown={(event) => resizeColumnWithKeyboard("left", event)}
            />

            <Paper withBorder radius="md" p="lg" bg="white">
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Badge color="teal" variant="light" mb="xs">{chapterParagraphs.length} paragraphs</Badge>
                    <Title order={2}>{selectedChapter?.title || data.selectedBook.title}</Title>
                    <Text c="dimmed">{chapterWords} words in chapter · {totalWords} words in book</Text>
                  </div>
                  <Group gap="xs">
                    <Button
                      component={Link}
                      href={`/books/${data.selectedBook.id}/read?returnTo=${encodeURIComponent(`/creativewriter?bookId=${data.selectedBook.id}`)}&returnLabel=${encodeURIComponent("Back to CreativeWriter")}`}
                      leftSection={<IconBook size={16} />}
                      color="cyan"
                      variant="light"
                    >
                      Reader View
                    </Button>
                    <Button leftSection={<IconCloudUp size={16} />} color="grape" loading={isPending} disabled={!dirty || !selectedParagraph} onClick={pushDraft}>
                      Push Draft
                    </Button>
                  </Group>
                </Group>

                <ScrollArea type="auto" offsetScrollbars>
                  <SegmentedControl
                    value={selectedParagraph?.id || ""}
                    onChange={selectParagraph}
                    data={chapterParagraphs.map((paragraph) => ({ label: String(paragraph.paragraphNumber), value: paragraph.id }))}
                    disabled={!chapterParagraphs.length}
                  />
                </ScrollArea>

                <Textarea
                  aria-label="CreativeWriter manuscript editor"
                  minRows={18}
                  autosize
                  value={draftText}
                  onChange={(event) => setDraftText(event.currentTarget.value)}
                  placeholder="Select a paragraph to begin editing."
                  leftSection={<IconWriting size={16} />}
                />
                {selectedParagraphComments.length > 0 && (
                  <Paper withBorder radius="sm" p="sm" bg="#fff9f0">
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text size="sm" fw={700}>Comments on this paragraph</Text>
                        <Badge size="xs" color="orange" variant="light">
                          {selectedParagraphComments.filter((comment) => !comment.resolved).length} open
                        </Badge>
                      </Group>
                      {selectedParagraphComments.map((comment) => (
                        <Paper key={comment.id} withBorder radius="sm" p="xs" bg={comment.resolved ? "#f8f9fa" : "white"}>
                          <Group justify="space-between" align="flex-start" wrap="nowrap">
                            <Text size="sm">{comment.note}</Text>
                            <Badge size="xs" color={comment.resolved ? "gray" : "orange"} variant="light">
                              {comment.resolved ? "Resolved" : "Open"}
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed">{formatDateTime(comment.createdAt)}</Text>
                        </Paper>
                      ))}
                    </Stack>
                  </Paper>
                )}
                <Group justify="space-between">
                  <Text size="sm" c={dirty ? "yellow" : "dimmed"}>{dirty ? "Unsynced local draft" : "No local changes"}</Text>
                  <Group gap="sm">
                    {dirty && (
                      <Button size="xs" variant="subtle" color="dark" onClick={discardDraft}>
                        Discard
                      </Button>
                    )}
                    <Text size="sm" c="dimmed">{countWords(draftText)} words</Text>
                  </Group>
                </Group>
              </Stack>
            </Paper>

            <ColumnResizeHandle
              ariaLabel="Resize support panel"
              onPointerDown={(event) => startColumnResize("right", event)}
              onKeyDown={(event) => resizeColumnWithKeyboard("right", event)}
            />

            <Paper withBorder radius="md" p="md" bg="white">
              <Tabs defaultValue="conflicts" keepMounted={false}>
                <Stack gap="sm" mb="md">
                  <TextInput
                    aria-label="Search support context"
                    placeholder="Search comments, notes, research, bible, world"
                    value={supportSearch}
                    onChange={(event) => setSupportSearch(event.currentTarget.value)}
                    leftSection={<IconSearch size={16} />}
                    rightSection={
                      supportSearch ? (
                        <Tooltip label="Clear search">
                          <ActionIcon aria-label="Clear support search" size="sm" variant="subtle" color="dark" onClick={clearSupportSearch}>
                            <IconX size={14} />
                          </ActionIcon>
                        </Tooltip>
                      ) : null
                    }
                  />
                  {pinnedSupportEntries.length > 0 && (
                    <Stack gap="xs">
                      <Text size="sm" fw={700}>Pinned Context</Text>
                      {filterSupportEntries(pinnedSupportEntries, supportSearch).map((entry) => (
                        <SupportEntryCard key={`pinned-${entry.id}`} entry={entry} pinned onTogglePin={togglePinnedSupport} compact />
                      ))}
                    </Stack>
                  )}
                </Stack>

                <Tabs.List style={{ flexWrap: "wrap", gap: 6, overflow: "visible" }}>
                  <Tabs.Tab value="conflicts" leftSection={<IconGitMerge size={14} />} style={SUPPORT_TAB_STYLE}>Conflicts</Tabs.Tab>
                  <Tabs.Tab value="comments" leftSection={<IconMessage size={14} />} style={SUPPORT_TAB_STYLE}>Comments {commentEntries.length ? `(${commentEntries.length})` : ""}</Tabs.Tab>
                  <Tabs.Tab value="notes" leftSection={<IconNotes size={14} />} style={SUPPORT_TAB_STYLE}>Notes {noteEntries.length ? `(${noteEntries.length})` : ""}</Tabs.Tab>
                  <Tabs.Tab value="research" leftSection={<IconSearch size={14} />} style={SUPPORT_TAB_STYLE}>Research {researchEntries.length ? `(${researchEntries.length})` : ""}</Tabs.Tab>
                  <Tabs.Tab value="bible" leftSection={<IconBook size={14} />} style={SUPPORT_TAB_STYLE}>Book Bible {bibleSummaryEntries.length ? `(${bibleSummaryEntries.length})` : ""}</Tabs.Tab>
                  <Tabs.Tab value="characters" leftSection={<IconUsers size={14} />} style={SUPPORT_TAB_STYLE}>Characters {characterEntries.length ? `(${characterEntries.length})` : ""}</Tabs.Tab>
                  <Tabs.Tab value="locations" leftSection={<IconMapPin size={14} />} style={SUPPORT_TAB_STYLE}>Locations {locationEntries.length ? `(${locationEntries.length})` : ""}</Tabs.Tab>
                  <Tabs.Tab value="themes" leftSection={<IconSparkles size={14} />} style={SUPPORT_TAB_STYLE}>Themes {themeEntries.length ? `(${themeEntries.length})` : ""}</Tabs.Tab>
                  <Tabs.Tab value="motifs" leftSection={<IconPalette size={14} />} style={SUPPORT_TAB_STYLE}>Motifs {motifEntries.length ? `(${motifEntries.length})` : ""}</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="conflicts" pt="md">
                  <Group justify="space-between" mb="md">
                    <div>
                      <Text fw={700}>Conflicts</Text>
                      <Text size="sm" c="dimmed">Ledger-backed review queue</Text>
                    </div>
                    <IconGitMerge size={20} />
                  </Group>
                  <Stack gap="sm">
                    {data.conflicts.map((conflict) => (
                      <Paper key={conflict.id} withBorder radius="sm" p="sm" bg="#fffdf7">
                        <Stack gap="xs">
                          <Group justify="space-between">
                            <Badge color="yellow">{conflict.conflictType}</Badge>
                            <Text size="xs" c="dimmed">{conflict.entityType}</Text>
                          </Group>
                          <Stack gap={4}>
                            <Text size="xs" fw={700}>Local draft</Text>
                            <Text size="sm" lineClamp={3}>{formatConflictPayload(conflict.localPayload)}</Text>
                          </Stack>
                          <Stack gap={4}>
                            <Text size="xs" fw={700}>Cloud version</Text>
                            <Text size="sm" lineClamp={3}>{formatConflictPayload(conflict.cloudPayload)}</Text>
                          </Stack>
                          <Textarea
                            aria-label={`Manual merge for ${conflict.id}`}
                            minRows={4}
                            value={conflictDrafts[conflict.id] ?? getConflictEditableText(conflict.localPayload)}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setConflictDrafts((current) => ({
                                ...current,
                                [conflict.id]: value,
                              }));
                            }}
                          />
                          <Group grow>
                            <Button size="xs" variant="light" color="dark" loading={isPending} onClick={() => resolveConflict(conflict, "resolved_cloud")}>Keep Cloud</Button>
                            <Button size="xs" variant="light" color="grape" loading={isPending} onClick={() => resolveConflict(conflict, "resolved_local")}>Use Local</Button>
                            <Button size="xs" color="teal" loading={isPending} onClick={() => resolveConflict(conflict, "resolved_manual")}>Apply Merge</Button>
                          </Group>
                        </Stack>
                      </Paper>
                    ))}
                    {!data.conflicts.length && (
                      <Alert color="teal" variant="light">No unresolved CreativeWriter conflicts for this book.</Alert>
                    )}
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="comments" pt="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <div>
                        <Text fw={700}>Comments</Text>
                        <Text size="sm" c="dimmed">Contributor review queue attached to the manuscript</Text>
                      </div>
                      <Badge color="orange" variant="light">
                        {openCommentCount} open
                      </Badge>
                    </Group>
                    <SegmentedControl
                      aria-label="Comment review filter"
                      value={commentReviewFilter}
                      onChange={(value) => setCommentReviewFilter(value as CommentReviewFilter)}
                      data={[
                        { label: `Open (${openCommentCount})`, value: "open" },
                        { label: `All (${data.readerComments.length})`, value: "all" },
                        { label: `Resolved (${resolvedCommentCount})`, value: "resolved" },
                      ]}
                      fullWidth
                    />
                    <CommentReviewList
                      comments={reviewComments}
                      paragraphNumberById={commentParagraphNumbers}
                      pinnedIds={pinnedSupportIds}
                      onTogglePin={togglePinnedSupport}
                      onSelectParagraph={selectCommentParagraph}
                      onSetResolved={updateReaderCommentResolution}
                      updating={isPending}
                      empty={supportSearch ? "No reader comments match this review filter." : "No reader comments in this review queue."}
                    />
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="notes" pt="md">
                  <Stack gap="sm">
                    <Text fw={700}>Author Notes</Text>
                    <SupportEntryList entries={noteEntries.filter((entry) => entry.kind === "note")} pinnedIds={pinnedSupportIds} onTogglePin={togglePinnedSupport} empty={supportSearch ? "No author notes match this search." : "No author notes saved for this book."} />
                    <Divider />
                    <Text fw={700}>Timeline Notes</Text>
                    <SupportEntryList entries={noteEntries.filter((entry) => entry.kind === "timeline")} pinnedIds={pinnedSupportIds} onTogglePin={togglePinnedSupport} empty={supportSearch ? "No timeline notes match this search." : "No timeline notes saved for this book."} />
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="research" pt="md">
                  <Stack gap="sm">
                    <Text fw={700}>Research</Text>
                    <SupportEntryList entries={researchEntries} pinnedIds={pinnedSupportIds} onTogglePin={togglePinnedSupport} empty={supportSearch ? "No research materials match this search." : "No research materials saved for this book."} />
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="bible" pt="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text fw={700}>Book Bible</Text>
                      <Text size="xs" c="dimmed">{formatUpdatedAt(data.support.bible.updatedAt)}</Text>
                    </Group>
                    <Text size="sm" c="dimmed">Blueprint Summary</Text>
                    <SupportEntryList entries={bibleSummaryEntries} pinnedIds={pinnedSupportIds} onTogglePin={togglePinnedSupport} empty={supportSearch ? "No blueprint summary matches this search." : "No blueprint summary saved for this book."} />
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="characters" pt="md">
                  <Stack gap="sm">
                    <Text fw={700}>Characters</Text>
                    <SupportEntryList entries={characterEntries} pinnedIds={pinnedSupportIds} onTogglePin={togglePinnedSupport} empty={supportSearch ? "No character profiles match this search." : "No character profiles saved for this book."} />
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="locations" pt="md">
                  <Stack gap="sm">
                    <Text fw={700}>Locations</Text>
                    <SupportEntryList entries={locationEntries} pinnedIds={pinnedSupportIds} onTogglePin={togglePinnedSupport} empty={supportSearch ? "No locations match this search." : "No locations saved for this book."} />
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="themes" pt="md">
                  <Stack gap="sm">
                    <Text fw={700}>Themes</Text>
                    <SupportEntryList entries={themeEntries} pinnedIds={pinnedSupportIds} onTogglePin={togglePinnedSupport} empty={supportSearch ? "No themes match this search." : "No themes saved for this book."} />
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="motifs" pt="md">
                  <Stack gap="sm">
                    <Text fw={700}>Motifs</Text>
                    <SupportEntryList entries={motifEntries} pinnedIds={pinnedSupportIds} onTogglePin={togglePinnedSupport} empty={supportSearch ? "No motifs match this search." : "No motifs saved for this book."} />
                  </Stack>
                </Tabs.Panel>
              </Tabs>
            </Paper>
          </div>
        )}
      </Stack>
    </Container>
  );
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function ColumnResizeHandle({
  ariaLabel,
  onPointerDown,
  onKeyDown,
}: {
  ariaLabel: string;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-orientation="vertical"
      role="separator"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      style={{
        width: RESIZE_HANDLE_WIDTH,
        cursor: "col-resize",
        border: 0,
        background: "transparent",
        padding: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "block",
          width: 2,
          height: "100%",
          minHeight: 420,
          margin: "0 auto",
          borderRadius: 999,
          background: "#e2e8f0",
        }}
      />
    </button>
  );
}

function SupportEntryList({
  entries,
  pinnedIds,
  onTogglePin,
  empty,
}: {
  entries: SupportEntry[];
  pinnedIds: string[];
  onTogglePin: (entryId: string) => void;
  empty: string;
}) {
  if (!entries.length) return <Alert color="gray" variant="light">{empty}</Alert>;
  return (
    <Stack gap="xs">
      {entries.map((entry) => (
        <SupportEntryCard key={entry.id} entry={entry} pinned={pinnedIds.includes(entry.id)} onTogglePin={onTogglePin} />
      ))}
    </Stack>
  );
}

function CommentReviewList({
  comments,
  paragraphNumberById,
  pinnedIds,
  onTogglePin,
  onSelectParagraph,
  onSetResolved,
  updating,
  empty,
}: {
  comments: CreativeWriterWorkspaceData["readerComments"];
  paragraphNumberById: Map<string, number>;
  pinnedIds: string[];
  onTogglePin: (entryId: string) => void;
  onSelectParagraph: (paragraphId: string | null) => void;
  onSetResolved: (commentId: string, resolved: boolean) => void;
  updating: boolean;
  empty: string;
}) {
  if (!comments.length) return <Alert color="gray" variant="light">{empty}</Alert>;
  return (
    <Stack gap="xs">
      {comments.map((comment) => (
        <CommentReviewCard
          key={comment.id}
          comment={comment}
          paragraphNumber={comment.paragraphId ? paragraphNumberById.get(comment.paragraphId) || null : null}
          pinned={pinnedIds.includes(commentSupportId(comment.id))}
          onTogglePin={onTogglePin}
          onSelectParagraph={onSelectParagraph}
          onSetResolved={onSetResolved}
          updating={updating}
        />
      ))}
    </Stack>
  );
}

function CommentReviewCard({
  comment,
  paragraphNumber,
  pinned,
  onTogglePin,
  onSelectParagraph,
  onSetResolved,
  updating,
}: {
  comment: CreativeWriterWorkspaceData["readerComments"][number];
  paragraphNumber: number | null;
  pinned: boolean;
  onTogglePin: (entryId: string) => void;
  onSelectParagraph: (paragraphId: string | null) => void;
  onSetResolved: (commentId: string, resolved: boolean) => void;
  updating: boolean;
}) {
  const title = paragraphNumber ? `Paragraph ${paragraphNumber}` : "General book comment";
  const supportId = commentSupportId(comment.id);
  return (
    <Paper withBorder radius="sm" p="sm" bg={pinned ? "#f8fff9" : comment.resolved ? "#f8f9fa" : "#fff9f0"}>
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Group gap={6}>
              <Text size="sm" fw={700}>{title}</Text>
              <Badge size="xs" color={comment.resolved ? "gray" : "orange"}>{comment.resolved ? "Resolved" : "Open"}</Badge>
            </Group>
            <Text size="xs" c="dimmed">{formatDateTime(comment.createdAt)}</Text>
          </div>
          <Tooltip label={pinned ? "Unpin context" : "Pin context"}>
            <ActionIcon
              aria-label={`${pinned ? "Unpin" : "Pin"} ${title}`}
              size="sm"
              variant="subtle"
              color={pinned ? "teal" : "dark"}
              onClick={() => onTogglePin(supportId)}
            >
              {pinned ? <IconPinFilled size={15} /> : <IconPin size={15} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text size="sm">{comment.note}</Text>
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            color="dark"
            disabled={!comment.paragraphId}
            onClick={() => onSelectParagraph(comment.paragraphId)}
          >
            Go to paragraph
          </Button>
          <Button
            size="xs"
            color={comment.resolved ? "orange" : "teal"}
            variant={comment.resolved ? "light" : "filled"}
            leftSection={!comment.resolved ? <IconCheck size={13} /> : undefined}
            loading={updating}
            onClick={() => onSetResolved(comment.id, !comment.resolved)}
          >
            {comment.resolved ? "Reopen" : "Mark resolved"}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function SupportEntryCard({
  entry,
  pinned,
  onTogglePin,
  compact = false,
}: {
  entry: SupportEntry;
  pinned: boolean;
  onTogglePin: (entryId: string) => void;
  compact?: boolean;
}) {
  return (
    <Paper withBorder radius="sm" p="sm" bg={pinned ? "#f8fff9" : undefined}>
      <Stack gap={4}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Group gap={6}>
              <Text size="sm" fw={700}>{entry.title}</Text>
              {entry.badge && <Badge size="xs" color="teal">{entry.badge}</Badge>}
            </Group>
            <Text size="xs" c="dimmed">{supportKindLabel(entry.kind)}</Text>
          </div>
          <Tooltip label={pinned ? "Unpin context" : "Pin context"}>
            <ActionIcon
              aria-label={`${pinned ? "Unpin" : "Pin"} ${entry.title}`}
              size="sm"
              variant="subtle"
              color={pinned ? "teal" : "dark"}
              onClick={() => onTogglePin(entry.id)}
            >
              {pinned ? <IconPinFilled size={15} /> : <IconPin size={15} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text size="sm" c={entry.text ? undefined : "dimmed"} lineClamp={compact ? 2 : 5}>{entry.text || "Not provided."}</Text>
        {entry.detail && <Text size="xs" c="dimmed" lineClamp={compact ? 1 : 3}>{entry.detail}</Text>}
      </Stack>
    </Paper>
  );
}

function buildSupportEntries(data: CreativeWriterWorkspaceData): SupportEntry[] {
  const entries: SupportEntry[] = [];
  const paragraphNumberById = new Map(data.paragraphs.map((paragraph) => [paragraph.id, paragraph.paragraphNumber]));
  data.readerComments.forEach((comment) => {
    const paragraphNumber = comment.paragraphId ? paragraphNumberById.get(comment.paragraphId) : null;
    addTextEntry(
      entries,
      commentSupportId(comment.id),
      "comment",
      paragraphNumber ? `Paragraph ${paragraphNumber}` : "General book comment",
      comment.note,
      formatDateTime(comment.createdAt),
      comment.resolved ? "Resolved" : "Open",
    );
  });

  const notes = data.support.authorNotes;
  if (notes) {
    addTextEntry(entries, "note:creative", "note", "Creative instructions", notes.creativeInstructions);
    addTextEntry(entries, "note:voice", "note", "Voice guidance", notes.voiceGuidance);
    addTextEntry(entries, "note:worldview", "note", "Contemporary view", notes.worldviewNotes);
    addTextEntry(entries, "note:alignment", "note", "Alignment", notes.theologicalAlignment);
    addTextEntry(entries, "note:forbidden", "note", "Forbidden changes", notes.forbiddenChanges);
  }

  data.support.bible.timeline.forEach((entry) => {
    addTextEntry(entries, `timeline:${entry.id}`, "timeline", entry.note, entry.detail, entry.sequenceOrder !== null ? `Sequence ${entry.sequenceOrder}` : null);
  });

  data.support.references.forEach((reference) => {
    addTextEntry(
      entries,
      `reference:${reference.id}`,
      "research",
      reference.title,
      reference.content,
      reference.materialType || "reference",
      reference.includeInPrompts ? "Prompted" : null,
    );
  });

  addTextEntry(entries, "bible:summary", "bible", "Blueprint summary", summarizeBibleContent(data.support.bible.content));
  data.support.bible.characters.forEach((entry) => addTextEntry(entries, `character:${entry.id}`, "character", entry.name, entry.description, entry.detail));
  data.support.bible.locations.forEach((entry) => addTextEntry(entries, `location:${entry.id}`, "location", entry.name, entry.description, entry.detail));
  data.support.bible.themes.forEach((entry) => addTextEntry(entries, `theme:${entry.id}`, "theme", entry.name, entry.description, entry.detail));
  data.support.bible.motifs.forEach((entry) => addTextEntry(entries, `motif:${entry.id}`, "motif", entry.name, entry.description, entry.detail));
  return entries;
}

function filterReaderComments(
  comments: CreativeWriterWorkspaceData["readerComments"],
  query: string,
  status: CommentReviewFilter,
  paragraphNumberById: Map<string, number>,
) {
  const normalized = query.trim().toLowerCase();
  return comments.filter((comment) => {
    if (status === "open" && comment.resolved) return false;
    if (status === "resolved" && !comment.resolved) return false;
    if (!normalized) return true;
    const paragraphNumber = comment.paragraphId ? paragraphNumberById.get(comment.paragraphId) : null;
    const paragraphLabel = paragraphNumber ? `Paragraph ${paragraphNumber}` : "General book comment";
    return [paragraphLabel, comment.note, comment.resolved ? "Resolved" : "Open", formatDateTime(comment.createdAt)].some((value) => value.toLowerCase().includes(normalized));
  });
}

function commentSupportId(commentId: string) {
  return `comment:${commentId}`;
}

function addTextEntry(entries: SupportEntry[], id: string, kind: SupportEntryKind, title: string, text: string | null | undefined, detail?: string | null, badge?: string | null) {
  if (!text && !detail) return;
  entries.push({ id, kind, title, text: text || "", detail, badge });
}

function filterSupportEntries(entries: SupportEntry[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) => [entry.title, entry.text, entry.detail, entry.badge, supportKindLabel(entry.kind)].some((value) => value?.toLowerCase().includes(normalized)));
}

function supportKindLabel(kind: SupportEntryKind) {
  const labels: Record<SupportEntryKind, string> = {
    note: "Author note",
    timeline: "Timeline",
    research: "Research",
    bible: "Book bible",
    character: "Character",
    location: "Location",
    theme: "Theme",
    motif: "Motif",
    comment: "Reader comment",
  };
  return labels[kind];
}

function groupReaderCommentsByParagraph(comments: CreativeWriterWorkspaceData["readerComments"]) {
  return comments.reduce<Record<string, CreativeWriterWorkspaceData["readerComments"]>>((groups, comment) => {
    if (!comment.paragraphId) return groups;
    groups[comment.paragraphId] = [...(groups[comment.paragraphId] || []), comment];
    return groups;
  }, {});
}

function pinnedSupportStorageKey(bookId: string) {
  return `bookforge:creativewriter:pinned-support:${bookId || "no-book"}`;
}

function loadPinnedSupportIds(bookId: string) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(pinnedSupportStorageKey(bookId)) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function savePinnedSupportIds(bookId: string, ids: string[]) {
  if (typeof window === "undefined" || !bookId) return;
  window.localStorage.setItem(pinnedSupportStorageKey(bookId), JSON.stringify(ids));
}

function workspaceLayoutStorageKey() {
  return "bookforge:creativewriter:workspace-layout";
}

function loadWorkspaceLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE_LAYOUT;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(workspaceLayoutStorageKey()) || "null") as Partial<WorkspaceLayout> | null;
    return clampWorkspaceLayout({
      left: numberOrDefault(parsed?.left, DEFAULT_WORKSPACE_LAYOUT.left),
      right: numberOrDefault(parsed?.right, DEFAULT_WORKSPACE_LAYOUT.right),
    });
  } catch {
    return DEFAULT_WORKSPACE_LAYOUT;
  }
}

function saveWorkspaceLayout(layout: WorkspaceLayout) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(workspaceLayoutStorageKey(), JSON.stringify(layout));
}

function clampWorkspaceLayout(layout: WorkspaceLayout, containerWidth = 1200): WorkspaceLayout {
  const maxSideWidth = Math.max(MIN_LEFT_WIDTH, containerWidth - MIN_EDITOR_WIDTH - MIN_RIGHT_WIDTH - RESIZE_HANDLE_WIDTH * 2);
  const left = clampNumber(Math.round(layout.left), MIN_LEFT_WIDTH, maxSideWidth);
  const maxRightWidth = Math.max(MIN_RIGHT_WIDTH, containerWidth - MIN_EDITOR_WIDTH - left - RESIZE_HANDLE_WIDTH * 2);
  const right = clampNumber(Math.round(layout.right), MIN_RIGHT_WIDTH, maxRightWidth);
  return { left, right };
}

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function summarizeBibleContent(content: Record<string, unknown> | null) {
  if (!content || !Object.keys(content).length) return null;
  const summary = stringValue(content.summary) || stringValue(content.premise) || stringValue(content.voice) || stringValue(content.genre);
  if (summary) return summary;
  const keys = Object.keys(content).slice(0, 8);
  return keys.length ? `Available sections: ${keys.join(", ")}` : null;
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "Not analyzed";
  return `Updated ${new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "No timestamp";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatConflictPayload(payload: Record<string, unknown>) {
  const text = getConflictEditableText(payload);
  if (text) return text;
  if (typeof payload.cloudVersion === "number") return `Cloud version ${payload.cloudVersion}`;
  return "No readable conflict text.";
}

function getConflictEditableText(payload: Record<string, unknown>) {
  for (const key of ["currentText", "title", "summary", "status"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function buildManualResolutionPayload(conflict: CreativeWriterConflictView, draftValue: string | undefined) {
  const payload = { ...conflict.localPayload };
  const key = conflictPayloadTextKey(conflict.localPayload) || conflictPayloadTextKey(conflict.cloudPayload) || "currentText";
  payload[key] = draftValue ?? getConflictEditableText(conflict.localPayload);
  return payload;
}

function conflictPayloadTextKey(payload: Record<string, unknown>) {
  return ["currentText", "title", "summary", "status"].find((key) => typeof payload[key] === "string");
}

function mergeCloudChanges(
  data: CreativeWriterWorkspaceData,
  changes: CreativeWriterCloudChange[],
  project: CreativeWriterWorkspaceData["project"],
): CreativeWriterWorkspaceData {
  return changes.reduce(
    (current, change) => {
      if (change.entityType === "book") {
        const nextBook = {
          id: change.entityId,
          title: stringValue(change.payload.title) || current.selectedBook?.title || "Untitled",
          authorName: nullableStringValue(change.payload.authorName),
          status: nullableStringValue(change.payload.status),
          updatedAt: change.updatedAt,
        };
        return {
          ...current,
          selectedBook: current.selectedBook?.id === change.entityId ? nextBook : current.selectedBook,
          books: current.books.map((book) => (book.id === change.entityId ? { ...book, ...nextBook } : book)),
        };
      }

      if (change.entityType === "chapter") {
        return {
          ...current,
          chapters: current.chapters.map((chapter) =>
            chapter.id === change.entityId
              ? {
                  ...chapter,
                  title: nullableStringValue(change.payload.title),
                  summary: nullableStringValue(change.payload.summary),
                  currentText: nullableStringValue(change.payload.currentText),
                  updatedAt: change.updatedAt,
                }
              : chapter,
          ),
        };
      }

      if (change.entityType === "paragraph") {
        return {
          ...current,
          paragraphs: current.paragraphs.map((paragraph) =>
            paragraph.id === change.entityId
              ? {
                  ...paragraph,
                  chapterId: stringValue(change.payload.chapterId) || paragraph.chapterId,
                  sourceParagraphNumber: numberValue(change.payload.paragraphNumber) || paragraph.sourceParagraphNumber,
                  currentText: nullableStringValue(change.payload.currentText),
                  acceptedText: nullableStringValue(change.payload.acceptedText),
                  updatedAt: change.updatedAt,
                }
              : paragraph,
          ),
        };
      }

      return current;
    },
    { ...data, project },
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nullableStringValue(value: unknown) {
  return typeof value === "string" || value === null ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
