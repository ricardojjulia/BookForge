import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/voice-capture/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("POST /api/books/[bookId]/voice-capture", () => {
  it("queues a durable voice-capture job when serverManaged is true", async () => {
    const insertSingle = vi.fn(async () => ({ data: { id: "11111111-1111-4111-8111-111111111111" }, error: null }));
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));

    const booksBuilder = {
      select: vi.fn(() => booksBuilder),
      eq: vi.fn(() => booksBuilder),
      single: vi.fn(async () => ({ data: { id: "book-1" }, error: null })),
    };

    const revisionJobsBuilder = {
      insert,
    };

    const from = vi.fn((table: string) => {
      if (table === "books") return booksBuilder;
      if (table === "revision_jobs") return revisionJobsBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/voice-capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chapterIds: ["11111111-1111-4111-8111-111111111111"],
          serverManaged: true,
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content?.queued).toBe(true);
    expect(payload.content?.jobId).toBe("11111111-1111-4111-8111-111111111111");
  });
});
