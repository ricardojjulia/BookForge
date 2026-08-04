import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/mark-finished/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("POST /api/books/[bookId]/mark-finished", () => {
  it("approves the rewrite strategy when actually marking the book finished", async () => {
    const booksBuilder = {
      select: vi.fn(() => booksBuilder),
      eq: vi.fn(() => booksBuilder),
      single: vi.fn(async () => ({ data: { id: "book-1", owner_id: "user-1" }, error: null })),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    };

    const exportsBuilder = {
      select: vi.fn(() => exportsBuilder),
      eq: vi.fn(() => exportsBuilder),
      single: vi.fn(async () => ({ data: { id: "export-1", status: "completed" }, error: null })),
    };

    let workflowUpsertPayload: Record<string, unknown> | null = null;
    const workflowsBuilder = {
      upsert: vi.fn((payload: Record<string, unknown>) => {
        workflowUpsertPayload = payload;
        return { data: null, error: null };
      }),
    };

    const from = vi.fn((table: string) => {
      if (table === "books") return booksBuilder;
      if (table === "exports") return exportsBuilder;
      if (table === "rewrite_workflows") return workflowsBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/mark-finished", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exportId: "11111111-1111-4111-8111-111111111111" }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.ok).toBe(true);
    expect(workflowsBuilder.upsert).toHaveBeenCalledTimes(1);
    expect(workflowUpsertPayload).toMatchObject({ book_id: "book-1", strategy_approved: true });
  });

  it("does not touch the rewrite workflow when reverting to draft (exportId: null)", async () => {
    const booksBuilder = {
      select: vi.fn(() => booksBuilder),
      eq: vi.fn(() => booksBuilder),
      single: vi.fn(async () => ({ data: { id: "book-1", owner_id: "user-1" }, error: null })),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    };

    const from = vi.fn((table: string) => {
      if (table === "books") return booksBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/mark-finished", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exportId: null }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.ok).toBe(true);
    // `from` never being asked for "rewrite_workflows" is itself the assertion --
    // the mock would throw "Unexpected table rewrite_workflows" if it were.
  });
});
