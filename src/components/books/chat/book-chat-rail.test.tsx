import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookChatRail } from "@/components/books/chat/book-chat-rail";

const mockFetch = vi.fn<typeof fetch>();

function renderRail() {
  return render(
    <MantineProvider>
      <BookChatRail bookId="book-1" />
    </MantineProvider>,
  );
}

function stubDocumentFonts() {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });

  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}

      unobserve() {}

      disconnect() {}
    },
  );
}

describe("BookChatRail", () => {
  afterEach(() => {
    cleanup();
    mockFetch.mockReset();
    vi.unstubAllGlobals();
  });

  it("switches mode and shows run-mode workflow buttons", async () => {
    stubDocumentFonts();
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/chat/threads")) {
        return new Response(JSON.stringify({ thread: { id: "thread-1", title: "Book Copilot", mode: "ask", updated_at: new Date().toISOString(), created_at: new Date().toISOString(), last_message_preview: null, last_message_at: null } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.includes("/chat/threads/thread-1")) {
        return new Response(JSON.stringify({ thread: { id: "thread-1", title: "Book Copilot", mode: "ask", updated_at: new Date().toISOString(), created_at: new Date().toISOString(), last_message_preview: null, last_message_at: null }, messages: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    vi.stubGlobal("fetch", mockFetch);

    renderRail();

    await waitFor(() => {
      expect(screen.getByText("Book Copilot Chat")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "run" }));

    expect(screen.getByRole("button", { name: "Run Rewrite Plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Critic Batch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Humanize Guidance" })).toBeInTheDocument();
  });

  it("shows a not-applied notice for a plain ask-mode reply with no proposal or tool call", async () => {
    stubDocumentFonts();
    const now = new Date().toISOString();

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/chat/threads") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            threads: [
              { id: "thread-1", title: "Book Copilot", mode: "ask", updated_at: now, created_at: now, last_message_preview: "reply", last_message_at: now },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/chat/threads/thread-1") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            thread: { id: "thread-1", title: "Book Copilot", mode: "ask", updated_at: now, created_at: now, last_message_preview: "reply", last_message_at: now },
            messages: [
              { id: "assistant-ask-1", role: "assistant", content: "Here's my take on the repetition in chapter 3.", created_at: now },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    vi.stubGlobal("fetch", mockFetch);

    renderRail();

    await waitFor(() => {
      expect(screen.getByText("Here's my take on the repetition in chapter 3.")).toBeInTheDocument();
      expect(screen.getByText(/This is feedback, not applied changes/)).toBeInTheDocument();
    });
  });

  it("renders metadata proposal cards returned by assistant", async () => {
    stubDocumentFonts();
    const now = new Date().toISOString();
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/chat/threads") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            threads: [
              {
                id: "thread-1",
                title: "Book Copilot",
                mode: "edit",
                updated_at: now,
                created_at: now,
                last_message_preview: "proposal",
                last_message_at: now,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.endsWith("/chat/threads") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            thread: {
              id: "thread-1",
              title: "Book Copilot",
              mode: "edit",
              updated_at: now,
              created_at: now,
              last_message_preview: "proposal",
              last_message_at: now,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/chat/threads/thread-1") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            thread: {
              id: "thread-1",
              title: "Book Copilot",
              mode: "edit",
              updated_at: now,
              created_at: now,
              last_message_preview: "proposal",
              last_message_at: now,
            },
            messages: [
              {
                id: "assistant-1",
                role: "assistant",
                content: "I drafted metadata updates.",
                content_json: {
                  proposals: [
                    {
                      id: "proposal-1",
                      title: "Update book metadata",
                      rationale: "Improve positioning.",
                      changes: {
                        title: "New Title",
                        genre: "Fiction",
                      },
                    },
                  ],
                },
                created_at: now,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    vi.stubGlobal("fetch", mockFetch);

    renderRail();

    await waitFor(() => {
      expect(screen.getByText("Update book metadata")).toBeInTheDocument();
      expect(screen.getByText("title: New Title")).toBeInTheDocument();
      expect(screen.getByText("genre: Fiction")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
      // A reply carrying a real proposal is NOT talk-only -- the not-applied
      // notice must stay hidden here, or a user would (correctly) read it as
      // implying the visible Apply button/proposal card doesn't count either.
      expect(screen.queryByText(/This is feedback, not applied changes/)).not.toBeInTheDocument();
    });
  });

  it("shows workflow result card and launches queued tool from Run Now", async () => {
    stubDocumentFonts();
    const now = new Date().toISOString();
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith("/chat/threads") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            threads: [
              {
                id: "thread-1",
                title: "Book Copilot",
                mode: "run",
                updated_at: now,
                created_at: now,
                last_message_preview: "queued",
                last_message_at: now,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/chat/threads/thread-1") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            thread: {
              id: "thread-1",
              title: "Book Copilot",
              mode: "run",
              updated_at: now,
              created_at: now,
              last_message_preview: "queued",
              last_message_at: now,
            },
            messages: [
              {
                id: "assistant-run-1",
                role: "assistant",
                content: "Rewrite plan queued as job job-123.",
                content_json: {
                  toolCall: {
                    id: "tool-1",
                    toolName: "rewrite_plan",
                    status: "queued",
                    jobId: "job-123",
                  },
                },
                created_at: now,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/tool-run") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            userMessage: { id: "u-1", role: "user", content: "Run rewrite plan", content_json: {}, created_at: now },
            assistantMessage: {
              id: "a-2",
              role: "assistant",
              content: "Rewrite plan run finished. Job job-123.",
              content_json: {
                toolCall: {
                  id: "tool-2",
                  toolName: "rewrite_plan",
                  status: "completed",
                  jobId: "job-123",
                },
              },
              created_at: now,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    vi.stubGlobal("fetch", mockFetch);

    renderRail();

    await waitFor(() => {
      expect(screen.getByText("Workflow result")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Run Now" })).toBeInTheDocument();
    });

    const openJobLink = screen.getByRole("link", { name: "Open Job" });
    expect(openJobLink.getAttribute("href")).toBe("/books/book-1/jobs?job=job-123");

    await userEvent.click(screen.getByRole("button", { name: "Run Now" }));

    await waitFor(() => {
      const call = requests.find((entry) => entry.url.includes("/tool-run") && entry.init?.method === "POST");
      expect(call).toBeTruthy();
      const parsed = JSON.parse(String(call?.init?.body || "{}")) as { toolArgs?: { launch?: boolean } };
      expect(parsed.toolArgs?.launch).toBe(true);
    });
  });

  it("submits create_revision_draft apply mode for revision draft proposals", async () => {
    stubDocumentFonts();
    const now = new Date().toISOString();
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith("/chat/threads") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            threads: [
              {
                id: "thread-1",
                title: "Book Copilot",
                mode: "edit",
                updated_at: now,
                created_at: now,
                last_message_preview: "proposal",
                last_message_at: now,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/chat/threads/thread-1") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            thread: {
              id: "thread-1",
              title: "Book Copilot",
              mode: "edit",
              updated_at: now,
              created_at: now,
              last_message_preview: "proposal",
              last_message_at: now,
            },
            messages: [
              {
                id: "assistant-2",
                role: "assistant",
                content: "I drafted rewrites.",
                content_json: {
                  proposals: [
                    {
                      id: "proposal-r1",
                      type: "create_revision_draft",
                      title: "Create revision draft(s)",
                      rationale: "Improve clarity.",
                      drafts: [
                        {
                          chapterNumber: 1,
                          paragraphNumber: 2,
                          revisedText: "Cleaner revised text.",
                        },
                      ],
                    },
                  ],
                },
                created_at: now,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/apply") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            toolMessage: {
              id: "tool-apply-1",
              role: "tool",
              content: "Created revision draft proposal.",
              created_at: now,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    vi.stubGlobal("fetch", mockFetch);

    renderRail();

    await waitFor(() => {
      expect(screen.getByText("Create revision draft(s)")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      const applyCall = requests.find((entry) => entry.url.includes("/apply") && entry.init?.method === "POST");
      expect(applyCall).toBeTruthy();
      const parsed = JSON.parse(String(applyCall?.init?.body || "{}")) as { applyMode?: string; idempotencyKey?: string };
      expect(parsed.applyMode).toBe("create_revision_draft");
      expect(parsed.idempotencyKey).toContain("proposal-r1");
    });

    await waitFor(() => {
      expect(screen.getAllByText("Applied")).toHaveLength(2); // status badge + the button itself
      expect(screen.getByRole("button", { name: "Applied" })).toBeDisabled();
    });
  });

  it("shows replay notice when apply returns idempotent=true", async () => {
    stubDocumentFonts();
    const now = new Date().toISOString();

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/chat/threads") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            threads: [
              {
                id: "thread-1",
                title: "Book Copilot",
                mode: "edit",
                updated_at: now,
                created_at: now,
                last_message_preview: "proposal",
                last_message_at: now,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/chat/threads/thread-1") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            thread: {
              id: "thread-1",
              title: "Book Copilot",
              mode: "edit",
              updated_at: now,
              created_at: now,
              last_message_preview: "proposal",
              last_message_at: now,
            },
            messages: [
              {
                id: "assistant-3",
                role: "assistant",
                content: "I drafted rewrites.",
                content_json: {
                  proposals: [
                    {
                      id: "proposal-r2",
                      type: "create_revision_draft",
                      title: "Create revision draft(s)",
                      rationale: "Improve clarity.",
                      drafts: [
                        {
                          paragraphId: "11111111-1111-4111-8111-111111111111",
                          revisedText: "Cleaner revised text.",
                        },
                      ],
                    },
                  ],
                },
                created_at: now,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/apply") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            idempotent: true,
            toolMessage: {
              id: "tool-apply-2",
              role: "tool",
              content: "Created revision draft proposal.",
              created_at: now,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    vi.stubGlobal("fetch", mockFetch);

    renderRail();

    await waitFor(() => {
      expect(screen.getByText("Create revision draft(s)")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByText("This apply request was already processed, so the existing result was reused.")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Replayed")).toBeInTheDocument();
    });
  });

  it("shows setup guidance when chat workspace is unavailable", async () => {
    stubDocumentFonts();
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith("/chat/threads") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            threads: [],
            unavailable: true,
            reason: "Chat workspace tables are not installed. Run the latest Supabase migrations.",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    vi.stubGlobal("fetch", mockFetch);

    renderRail();

    await waitFor(() => {
      expect(screen.getByText("Chat workspace tables are not installed. Run the latest Supabase migrations.")).toBeInTheDocument();
    });

    const docsLink = screen.getByRole("link", { name: "Open setup docs" });
    expect(docsLink.getAttribute("href")).toContain("202607270001_chat_workspace.sql");

    expect(requests.some((entry) => entry.url.includes("/chat/threads") && entry.init?.method === "POST")).toBe(false);
  });
});
