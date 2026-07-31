import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/chat/threads/[threadId]/tool-run/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("POST /api/books/[bookId]/chat/threads/[threadId]/tool-run", () => {
  it("queues rewrite plan and persists tool-call trace", async () => {
    const threadSingle = vi.fn(async () => ({ data: { id: "thread-1", book_id: "book-1" }, error: null }));
    const threadEqBook = vi.fn(() => ({ single: threadSingle }));
    const threadEqId = vi.fn(() => ({ eq: threadEqBook }));
    const threadSelect = vi.fn(() => ({ eq: threadEqId }));

    const userInsertSingle = vi.fn(async () => ({
      data: { id: "m-user", role: "user", content: "Run rewrite plan", content_json: {}, created_at: new Date().toISOString() },
      error: null,
    }));
    const userInsertSelect = vi.fn(() => ({ single: userInsertSingle }));
    const userInsert = vi.fn(() => ({ select: userInsertSelect }));

    const assistantInsertSingle = vi.fn(async () => ({
      data: { id: "m-assistant", role: "assistant", content: "Running...", content_json: {}, created_at: new Date().toISOString() },
      error: null,
    }));
    const assistantInsertSelect = vi.fn(() => ({ single: assistantInsertSingle }));
    const assistantInsert = vi.fn(() => ({ select: assistantInsertSelect }));

    const toolCallInsertSingle = vi.fn(async () => ({
      data: { id: "tool-1", tool_name: "rewrite_plan", status: "queued", job_id: "job-123", tool_result: {}, created_at: new Date().toISOString() },
      error: null,
    }));
    const toolCallInsertSelect = vi.fn(() => ({ single: toolCallInsertSingle }));
    const toolCallInsert = vi.fn(() => ({ select: toolCallInsertSelect }));

    const assistantUpdateSingle = vi.fn(async () => ({
      data: { id: "m-assistant", role: "assistant", content: "Rewrite plan queued as job job-123.", content_json: {}, created_at: new Date().toISOString() },
      error: null,
    }));
    const assistantUpdateSelect = vi.fn(() => ({ single: assistantUpdateSingle }));
    const assistantUpdateEqThread = vi.fn(() => ({ select: assistantUpdateSelect }));
    const assistantUpdateEqId = vi.fn(() => ({ eq: assistantUpdateEqThread }));
    const assistantUpdateEqBook = vi.fn(() => ({ eq: assistantUpdateEqId }));
    const assistantUpdate = vi.fn(() => ({ eq: assistantUpdateEqBook }));

    const threadUpdateEqBook = vi.fn(async () => ({ error: null }));
    const threadUpdateEqId = vi.fn(() => ({ eq: threadUpdateEqBook }));
    const threadUpdate = vi.fn(() => ({ eq: threadUpdateEqId }));

    let chatMessagesInsertCount = 0;

    const from = vi.fn((table: string) => {
      if (table === "chat_threads") {
        return {
          select: threadSelect,
          update: threadUpdate,
        };
      }

      if (table === "chat_messages") {
        return {
          insert: (...args: unknown[]) => {
            chatMessagesInsertCount += 1;
            return chatMessagesInsertCount === 1 ? userInsert(...args) : assistantInsert(...args);
          },
          update: assistantUpdate,
        };
      }

      if (table === "chat_tool_calls") {
        return { insert: toolCallInsert };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/rewrite-plan") && init?.method === "POST") {
        return new Response(JSON.stringify({ content: { jobId: "job-123", queued: true, totalUnits: 1 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Unexpected downstream call" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/chat/threads/thread-1/tool-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolName: "rewrite_plan", command: "Run rewrite plan" }),
      }),
      { params: Promise.resolve({ bookId: "book-1", threadId: "thread-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.toolCall?.status).toBe("queued");
    expect(payload.toolCall?.job_id).toBe("job-123");
    expect(payload.assistantMessage?.content).toContain("queued");

    fetchMock.mockRestore();
  });

  it("launches rewrite plan immediately when launch=true", async () => {
    const threadSingle = vi.fn(async () => ({ data: { id: "thread-1", book_id: "book-1" }, error: null }));
    const threadEqBook = vi.fn(() => ({ single: threadSingle }));
    const threadEqId = vi.fn(() => ({ eq: threadEqBook }));
    const threadSelect = vi.fn(() => ({ eq: threadEqId }));

    const userInsertSingle = vi.fn(async () => ({
      data: { id: "m-user", role: "user", content: "Run rewrite plan", content_json: {}, created_at: new Date().toISOString() },
      error: null,
    }));
    const userInsertSelect = vi.fn(() => ({ single: userInsertSingle }));
    const userInsert = vi.fn(() => ({ select: userInsertSelect }));

    const assistantInsertSingle = vi.fn(async () => ({
      data: { id: "m-assistant", role: "assistant", content: "Running...", content_json: {}, created_at: new Date().toISOString() },
      error: null,
    }));
    const assistantInsertSelect = vi.fn(() => ({ single: assistantInsertSingle }));
    const assistantInsert = vi.fn(() => ({ select: assistantInsertSelect }));

    const toolCallInsertSingle = vi.fn(async () => ({
      data: { id: "tool-2", tool_name: "rewrite_plan", status: "completed", job_id: "job-456", tool_result: {}, created_at: new Date().toISOString() },
      error: null,
    }));
    const toolCallInsertSelect = vi.fn(() => ({ single: toolCallInsertSingle }));
    const toolCallInsert = vi.fn(() => ({ select: toolCallInsertSelect }));

    const assistantUpdateSingle = vi.fn(async () => ({
      data: { id: "m-assistant", role: "assistant", content: "Rewrite plan run finished. Job job-456.", content_json: {}, created_at: new Date().toISOString() },
      error: null,
    }));
    const assistantUpdateSelect = vi.fn(() => ({ single: assistantUpdateSingle }));
    const assistantUpdateEqThread = vi.fn(() => ({ select: assistantUpdateSelect }));
    const assistantUpdateEqId = vi.fn(() => ({ eq: assistantUpdateEqThread }));
    const assistantUpdateEqBook = vi.fn(() => ({ eq: assistantUpdateEqId }));
    const assistantUpdate = vi.fn(() => ({ eq: assistantUpdateEqBook }));

    const threadUpdateEqBook = vi.fn(async () => ({ error: null }));
    const threadUpdateEqId = vi.fn(() => ({ eq: threadUpdateEqBook }));
    const threadUpdate = vi.fn(() => ({ eq: threadUpdateEqId }));

    let chatMessagesInsertCount = 0;

    const from = vi.fn((table: string) => {
      if (table === "chat_threads") {
        return {
          select: threadSelect,
          update: threadUpdate,
        };
      }

      if (table === "chat_messages") {
        return {
          insert: (...args: unknown[]) => {
            chatMessagesInsertCount += 1;
            return chatMessagesInsertCount === 1 ? userInsert(...args) : assistantInsert(...args);
          },
          update: assistantUpdate,
        };
      }

      if (table === "chat_tool_calls") {
        return { insert: toolCallInsert };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      fetchCalls.push({ url, init });
      if (url.endsWith("/rewrite-plan") && init?.method === "POST") {
        const parsedBody = JSON.parse(String(init.body || "{}")) as { serverManaged?: boolean; jobId?: string };
        if (parsedBody.serverManaged) {
          return new Response(JSON.stringify({ content: { jobId: "job-456", queued: true } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (parsedBody.jobId === "job-456") {
          return new Response(JSON.stringify({ ok: true, summary: "executed" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      }
      return new Response(JSON.stringify({ error: "Unexpected downstream call" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/chat/threads/thread-1/tool-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolName: "rewrite_plan", command: "Run rewrite plan", toolArgs: { launch: true } }),
      }),
      { params: Promise.resolve({ bookId: "book-1", threadId: "thread-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.toolCall?.status).toBe("completed");
    expect(payload.toolCall?.job_id).toBe("job-456");
    expect(payload.assistantMessage?.content).toContain("run finished");
    expect(fetchCalls.filter((call) => call.url.endsWith("/rewrite-plan"))).toHaveLength(2);

    fetchMock.mockRestore();
  });
});
