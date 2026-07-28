import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/publishing-lab/route";

const { mockCreateClient, runPublishingLabMock } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  runPublishingLabMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/publishing-lab/run", () => ({
  runPublishingLab: runPublishingLabMock,
}));

describe("POST /api/books/[bookId]/publishing-lab", () => {
  it("queues a durable publishing lab job when serverManaged is true", async () => {
    const insertSingle = vi.fn(async () => ({ data: { id: "11111111-1111-4111-8111-111111111111" }, error: null }));
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));

    const booksBuilder = {
      select: vi.fn(() => booksBuilder),
      eq: vi.fn(() => booksBuilder),
      single: vi.fn(async () => ({ data: { id: "book-1", owner_id: "user-1", status: "finished" }, error: null })),
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
      new Request("http://localhost/api/books/book-1/publishing-lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run", serverManaged: true }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content?.queued).toBe(true);
    expect(payload.content?.jobId).toBe("11111111-1111-4111-8111-111111111111");
    expect(runPublishingLabMock).not.toHaveBeenCalled();
  });
});
