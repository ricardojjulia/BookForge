"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Group, Loader, Paper, ScrollArea, Stack, Text, Textarea, Title } from "@mantine/core";
import Link from "next/link";
import { GenerationProgressAlert } from "@/components/ai/generation-progress-alert";
import { fetchJson } from "@/lib/http/fetch-json";
import { mergeMetadataSnapshotBody } from "@/lib/book-metadata/selection";

type ChatMode = "ask" | "edit" | "run" | "council";

type ChatThread = {
  id: string;
  title: string | null;
  mode: ChatMode;
  last_message_preview: string | null;
  last_message_at: string | null;
  updated_at: string;
  created_at: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  content_json?: Record<string, unknown>;
  created_at: string;
};

type ThreadPayload = {
  thread: ChatThread;
  messages: ChatMessage[];
};

type ThreadListPayload = {
  threads: ChatThread[];
  unavailable?: boolean;
  reason?: string;
};

type ProposalType = "update_metadata" | "create_revision_draft";
type ProposalApplyStatus = "applied" | "replayed";
const CHAT_SETUP_DOCS_URL = "https://github.com/ricardojjulia/BookForge/blob/main/supabase/migrations/202607270001_chat_workspace.sql";

export function BookChatRail({ bookId }: { bookId: string }) {
  const [mode, setMode] = useState<ChatMode>("ask");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [runLaunchMode, setRunLaunchMode] = useState<"queue" | "launch">("queue");
  const [applyingProposalId, setApplyingProposalId] = useState<string | null>(null);
  const [proposalApplyStatus, setProposalApplyStatus] = useState<Record<string, ProposalApplyStatus>>({});
  const [error, setError] = useState("");
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || null,
    [threads, activeThreadId],
  );
  const showSetupDocsLink = error.toLowerCase().includes("chat workspace tables are not installed");

  const loadThread = useCallback(async (threadId: string) => {
    setLoadingMessages(true);
    setError("");
    setApplyNotice(null);
    setProposalApplyStatus({});
    setAuthRequired(false);
    try {
      const payload = await fetchJson<ThreadPayload>(
        `/api/books/${bookId}/chat/threads/${threadId}?limit=80`,
        undefined,
        "Load chat thread",
      );
      setMessages(payload.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load chat messages.");
    } finally {
      setLoadingMessages(false);
    }
  }, [bookId]);

  const createThread = useCallback(async (title: string, mode: ChatMode) => {
    const payload = await fetchJson<{ thread: ChatThread }>(
      `/api/books/${bookId}/chat/threads`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, mode }),
      },
      "Create chat thread",
    );

    setThreads((current) => [payload.thread, ...current.filter((item) => item.id !== payload.thread.id)]);
    return payload.thread;
  }, [bookId]);

  const bootstrap = useCallback(async () => {
    setLoadingThreads(true);
    setError("");
    setAuthRequired(false);
    try {
      const list = await fetchJson<ThreadListPayload>(`/api/books/${bookId}/chat/threads`, undefined, "Load chat threads");
      if (list.unavailable) {
        setThreads([]);
        setActiveThreadId(null);
        setMessages([]);
        setError(list.reason || "Book chat workspace is unavailable. Run the latest database migrations and reload.");
        return;
      }
      const existing = list.threads || [];
      setThreads(existing);

      if (existing.length > 0) {
        const firstId = existing[0].id;
        setActiveThreadId(firstId);
        await loadThread(firstId);
      } else {
        const created = await createThread("Book Copilot", "ask");
        setActiveThreadId(created.id);
        setMessages([]);
      }
    } catch (err) {
      if (isAuthError(err)) {
        setThreads([]);
        setActiveThreadId(null);
        setMessages([]);
        setAuthRequired(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to load chat workspace.");
    } finally {
      setLoadingThreads(false);
    }
  }, [bookId, createThread, loadThread]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void bootstrap();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [bootstrap]);

  async function startNewThread() {
    setError("");
    setApplyNotice(null);
    setProposalApplyStatus({});
    setAuthRequired(false);
    try {
      const created = await createThread("New book chat", "ask");
      setActiveThreadId(created.id);
      setMessages([]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create thread.");
    }
  }

  async function sendMessage() {
    const trimmed = draft.trim();
    if (!trimmed || !activeThreadId || sending) return;

    const optimisticId = `tmp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setDraft("");
    setSending(true);
    setError("");
    setAuthRequired(false);
    setMessages((current) => [...current, optimisticMessage]);

    try {
      const response = await fetchJson<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>(
        `/api/books/${bookId}/chat/threads/${activeThreadId}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userMessage: trimmed, mode, scope: "whole_book" }),
        },
        "Send chat message",
      );

      setMessages((current) => {
        const withoutOptimistic = current.filter((item) => item.id !== optimisticId);
        return [...withoutOptimistic, response.userMessage, response.assistantMessage];
      });

      const refreshed = await fetchJson<{ threads: ChatThread[] }>(`/api/books/${bookId}/chat/threads`, undefined, "Refresh chat threads");
      setThreads(refreshed.threads || []);
    } catch (err) {
      setMessages((current) => current.filter((item) => item.id !== optimisticId));
      setError(err instanceof Error ? err.message : "Unable to send chat message.");
    } finally {
      setSending(false);
    }
  }

  async function runTool(
    toolName: "rewrite_plan" | "critic_all" | "humanize_guidance",
    launchOverride?: boolean,
  ) {
    if (!activeThreadId || runningTool) return;
    setRunningTool(toolName);
    setError("");
    setAuthRequired(false);
    try {
      const launch = typeof launchOverride === "boolean" ? launchOverride : runLaunchMode === "launch";
      const response = await fetchJson<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>(
        `/api/books/${bookId}/chat/threads/${activeThreadId}/tool-run`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            toolName,
            command: `Run ${toolName}`,
            toolArgs: { launch, ...mergeMetadataSnapshotBody() },
          }),
        },
        "Run chat workflow tool",
      );

      setMessages((current) => [...current, response.userMessage, response.assistantMessage]);

      const refreshed = await fetchJson<{ threads: ChatThread[] }>(`/api/books/${bookId}/chat/threads`, undefined, "Refresh chat threads");
      setThreads(refreshed.threads || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run workflow tool.");
    } finally {
      setRunningTool(null);
    }
  }

  async function applyProposal(messageId: string, proposalId: string, applyMode: ProposalType) {
    if (!activeThreadId || applyingProposalId) return;
    setApplyingProposalId(proposalId);
    setError("");
    setApplyNotice(null);
    setAuthRequired(false);
    const idempotencyKey = `${messageId}:${proposalId}:${applyMode}`;
    try {
      const response = await fetchJson<{ toolMessage: ChatMessage; idempotent?: boolean }>(
        `/api/books/${bookId}/chat/threads/${activeThreadId}/apply`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messageId, proposalId, applyMode, idempotencyKey }),
        },
        "Apply proposal",
      );

      setMessages((current) => [...current, response.toolMessage]);
      setProposalApplyStatus((current) => ({
        ...current,
        [proposalId]: response.idempotent ? "replayed" : "applied",
      }));
      if (response.idempotent) {
        setApplyNotice("This apply request was already processed, so the existing result was reused.");
      }
      const refreshed = await fetchJson<{ threads: ChatThread[] }>(`/api/books/${bookId}/chat/threads`, undefined, "Refresh chat threads");
      setThreads(refreshed.threads || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply proposal.");
    } finally {
      setApplyingProposalId(null);
    }
  }

  function renderProposalCard(message: ChatMessage) {
    const proposals = Array.isArray(message.content_json?.proposals)
      ? (message.content_json?.proposals as Array<Record<string, unknown>>)
      : [];
    if (!proposals.length) return null;

    return (
      <Stack mt="sm" gap="xs">
        {proposals.map((proposal) => {
          const changes = (proposal.changes && typeof proposal.changes === "object"
            ? proposal.changes
            : {}) as Record<string, unknown>;
          const rows = Object.entries(changes);
          const proposalType = String(proposal.type || "update_metadata") as ProposalType;
          const draftRows = Array.isArray(proposal.drafts)
            ? (proposal.drafts as Array<Record<string, unknown>>)
            : [];
          const proposalId = String(proposal.id || "");
          const applyStatus = proposalApplyStatus[proposalId];
          return (
            <Paper key={String(proposal.id || Math.random())} withBorder radius="sm" p="sm" bg="#fff8e8">
              <Group justify="space-between" align="center" gap="xs">
                <Text size="sm" fw={700}>{String(proposal.title || "Metadata proposal")}</Text>
                {applyStatus ? (
                  <Badge size="xs" color={applyStatus === "replayed" ? "blue" : "green"} variant="light">
                    {applyStatus === "replayed" ? "Replayed" : "Applied"}
                  </Badge>
                ) : null}
              </Group>
              {String(proposal.rationale || "") && (
                <Text size="xs" c="dimmed" mt={4}>
                  {String(proposal.rationale)}
                </Text>
              )}
              {proposalType === "update_metadata" && !rows.length ? (
                <Text size="xs" c="dimmed" mt={4}>No valid metadata changes found.</Text>
              ) : null}
              {proposalType === "update_metadata" && rows.length ? (
                <Stack gap={2} mt="xs">
                  {rows.map(([key, value]) => (
                    <Text key={key} size="xs">
                      {key}: {String(value)}
                    </Text>
                  ))}
                </Stack>
              ) : null}
              {proposalType === "create_revision_draft" && !draftRows.length ? (
                <Text size="xs" c="dimmed" mt={4}>No valid draft targets found.</Text>
              ) : null}
              {proposalType === "create_revision_draft" && draftRows.length ? (
                <Stack gap={4} mt="xs">
                  {draftRows.map((draft, index) => {
                    const paragraphId = String(draft.paragraphId || "");
                    const chapterNumber = Number(draft.chapterNumber || 0);
                    const paragraphNumber = Number(draft.paragraphNumber || 0);
                    const revisedText = String(draft.revisedText || "");
                    return (
                      <Paper key={`${proposal.id}-${index}`} withBorder radius="xs" p="xs" bg="white">
                        <Text size="xs" fw={700}>
                          {paragraphId
                            ? `Paragraph ${paragraphId}`
                            : `Chapter ${chapterNumber || "?"}, paragraph ${paragraphNumber || "?"}`}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={3}>
                          {revisedText || "No revised text."}
                        </Text>
                      </Paper>
                    );
                  })}
                </Stack>
              ) : null}
              <Group justify="flex-end" mt="sm">
                <Button
                  size="xs"
                  color="teal"
                  loading={applyingProposalId === String(proposal.id || "")}
                  disabled={!proposal.id || (proposalType === "update_metadata" && !rows.length) || (proposalType === "create_revision_draft" && !draftRows.length)}
                  onClick={() => applyProposal(message.id, proposalId, proposalType)}
                >
                  Apply
                </Button>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    );
  }

  function renderToolCallCard(message: ChatMessage) {
    const toolCall = message.content_json?.toolCall;
    if (!toolCall || typeof toolCall !== "object") return null;
    const record = toolCall as Record<string, unknown>;
    const toolName = String(record.toolName || "workflow");
    const status = String(record.status || "completed");
    const jobId = typeof record.jobId === "string" && record.jobId ? record.jobId : null;
    const statusColor = status === "completed" ? "green" : status === "queued" ? "yellow" : status === "running" ? "blue" : "red";

    return (
      <Paper withBorder radius="sm" p="sm" bg="#f4f8ff" mt="sm">
        <Group justify="space-between" align="center" mb={6}>
          <Text size="xs" fw={700}>Workflow result</Text>
          <Badge size="xs" color={statusColor} variant="light">{status}</Badge>
        </Group>
        <Text size="xs">Tool: {toolName}</Text>
        {jobId ? <Text size="xs">Job: {jobId}</Text> : <Text size="xs" c="dimmed">No job id (completed inline).</Text>}
        <Group justify="space-between" mt="sm">
          <Button
            component={Link}
            href={jobId ? `/books/${bookId}/jobs?job=${encodeURIComponent(jobId)}` : `/books/${bookId}/jobs`}
            size="xs"
            variant="subtle"
            color="grape"
          >
            {jobId ? "Open Job" : "Open Jobs"}
          </Button>
          {status === "queued" && (toolName === "rewrite_plan" || toolName === "critic_all") && (
            <Button size="xs" color="teal" variant="light" loading={runningTool === toolName} onClick={() => runTool(toolName as "rewrite_plan" | "critic_all", true)}>
              Run Now
            </Button>
          )}
        </Group>
      </Paper>
    );
  }

  return (
    <Paper withBorder radius="md" p="xl" bg="white" mt="xl">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Book Copilot Chat</Title>
            <Text c="dimmed" size="sm">
              Persistent ask-mode assistant with book-aware context.
            </Text>
          </div>
          <Group gap="xs">
            <Badge color="blue" variant="light">
              MVP
            </Badge>
            <Badge color="grape" variant="light">
              {mode}
            </Badge>
            <Button size="xs" variant="light" color="grape" onClick={startNewThread}>
              New Thread
            </Button>
          </Group>
        </Group>

        <Group gap="xs">
          {(["ask", "edit", "run", "council"] as ChatMode[]).map((entryMode) => (
            <Button
              key={entryMode}
              size="xs"
              variant={mode === entryMode ? "filled" : "light"}
              color={mode === entryMode ? "grape" : "gray"}
              onClick={() => setMode(entryMode)}
            >
              {entryMode}
            </Button>
          ))}
        </Group>

        {mode === "run" && (
          <Stack gap="xs">
            <Group gap="xs">
              <Text size="xs" c="dimmed">Execution:</Text>
              <Button
                size="xs"
                variant={runLaunchMode === "queue" ? "filled" : "light"}
                color={runLaunchMode === "queue" ? "gray" : "gray"}
                onClick={() => setRunLaunchMode("queue")}
              >
                Queue only
              </Button>
              <Button
                size="xs"
                variant={runLaunchMode === "launch" ? "filled" : "light"}
                color={runLaunchMode === "launch" ? "teal" : "gray"}
                onClick={() => setRunLaunchMode("launch")}
              >
                Queue + run
              </Button>
            </Group>
            <Group gap="xs">
            <Button size="xs" color="teal" variant="light" loading={runningTool === "rewrite_plan"} onClick={() => runTool("rewrite_plan")}>Run Rewrite Plan</Button>
            <Button size="xs" color="orange" variant="light" loading={runningTool === "critic_all"} onClick={() => runTool("critic_all")}>Run Critic Batch</Button>
            <Button size="xs" color="blue" variant="light" loading={runningTool === "humanize_guidance"} onClick={() => runTool("humanize_guidance")}>Run Humanize Guidance</Button>
            </Group>
            <GenerationProgressAlert
              active={runningTool !== null}
              message={
                runningTool === "rewrite_plan"
                  ? "Running rewrite plan..."
                  : runningTool === "critic_all"
                    ? "Running all critic lenses..."
                    : "Generating humanized guidance..."
              }
              estimatedSeconds={runningTool === "critic_all" ? 45 : 30}
              color="teal"
            />
          </Stack>
        )}

        {authRequired && (
          <Alert color="grape" title="Login required">
            <Group justify="space-between" align="center" wrap="wrap">
              <Text size="sm">Sign in to load or create chat threads for this book.</Text>
              <Button component={Link} href="/auth" size="xs" variant="light" color="grape">
                Sign In
              </Button>
            </Group>
          </Alert>
        )}

        {!authRequired && error && (
          <Alert color="red">
            <Group justify="space-between" align="center" wrap="wrap">
              <Text size="sm">{error}</Text>
              {showSetupDocsLink ? (
                <Button
                  component="a"
                  href={CHAT_SETUP_DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                  size="xs"
                  variant="light"
                  color="red"
                >
                  Open setup docs
                </Button>
              ) : null}
            </Group>
          </Alert>
        )}
        {!authRequired && applyNotice && <Alert color="blue">{applyNotice}</Alert>}

        <Group align="flex-start" grow>
          <Paper withBorder radius="sm" p="sm" bg="#fbfaf8" style={{ minWidth: 220, maxWidth: 320 }}>
            <Stack gap={6}>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                Threads
              </Text>
              {loadingThreads ? (
                <Group justify="center" py="md">
                  <Loader size="sm" />
                </Group>
              ) : authRequired ? (
                <Text size="sm" c="dimmed">
                  Sign in to create or load threads.
                </Text>
              ) : !threads.length ? (
                <Text size="sm" c="dimmed">
                  No threads yet.
                </Text>
              ) : (
                threads.map((thread) => {
                  const active = thread.id === activeThreadId;
                  return (
                    <Button
                      key={thread.id}
                      variant={active ? "filled" : "subtle"}
                      color={active ? "grape" : "gray"}
                      justify="flex-start"
                      onClick={async () => {
                        setActiveThreadId(thread.id);
                        await loadThread(thread.id);
                      }}
                      styles={{ inner: { justifyContent: "flex-start" } }}
                    >
                      <Stack gap={2} align="flex-start">
                        <Text size="xs" fw={700} lineClamp={1}>
                          {thread.title || "Untitled"}
                        </Text>
                        <Text size="xs" c={active ? "white" : "dimmed"} lineClamp={1}>
                          {thread.last_message_preview || "No messages yet"}
                        </Text>
                      </Stack>
                    </Button>
                  );
                })
              )}
            </Stack>
          </Paper>

          <Stack style={{ flex: 1 }}>
            <Paper withBorder radius="sm" p="sm" bg="#f8f7ff">
              <Group justify="space-between">
                <Text size="sm" fw={700}>
                  {activeThread?.title || "Book chat"}
                </Text>
                <Badge color="grape" variant="light">
                  {mode}
                </Badge>
              </Group>
            </Paper>

            <Paper withBorder radius="sm" p="sm" bg="white">
              <ScrollArea h={360} type="always">
                <Stack>
                  {loadingMessages ? (
                    <Group justify="center" py="md">
                      <Loader size="sm" />
                    </Group>
                  ) : !messages.length ? (
                    <Text c="dimmed" size="sm">
                      Ask about chapters, structure, tone, continuity, or planning.
                    </Text>
                  ) : (
                    messages.map((message) => (
                      <Paper
                        key={message.id}
                        withBorder
                        radius="sm"
                        p="sm"
                        bg={message.role === "user" ? "#f2f7ff" : "#f8fff5"}
                      >
                        <Group justify="space-between" mb={4}>
                          <Badge size="xs" color={message.role === "user" ? "blue" : "teal"} variant="light">
                            {message.role}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            {new Date(message.created_at).toLocaleTimeString()}
                          </Text>
                        </Group>
                        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                          {message.content}
                        </Text>
                        {message.role === "assistant" && renderProposalCard(message)}
                        {message.role === "assistant" && renderToolCallCard(message)}
                      </Paper>
                    ))
                  )}
                </Stack>
              </ScrollArea>
            </Paper>

            <Textarea
              label="Message"
              placeholder="Ask Book Copilot about your manuscript..."
              minRows={3}
              maxRows={8}
              autosize
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button
                color="grape"
                onClick={sendMessage}
                loading={sending}
                disabled={!activeThreadId || !draft.trim()}
              >
                Send
              </Button>
            </Group>
          </Stack>
        </Group>
      </Stack>
    </Paper>
  );
}

function isAuthError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /authentication required|unauthorized|401/i.test(error.message);
}
