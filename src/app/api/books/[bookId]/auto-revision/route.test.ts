import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/auto-revision/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("POST /api/books/[bookId]/auto-revision", () => {
  it("queues a durable auto-revision job when serverManaged is true", async () => {
    const insertSingle = vi.fn(async () => ({ data: { id: "11111111-1111-4111-8111-111111111111" }, error: null }));
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));

    const booksBuilder = {
      select: vi.fn(() => booksBuilder),
      eq: vi.fn(() => booksBuilder),
      single: vi.fn(async () => ({ data: { id: "book-1", title: "Book" }, error: null })),
    };

    const revisionsBuilder = {
      select: vi.fn(() => revisionsBuilder),
      eq: vi.fn(() => revisionsBuilder),
      not: vi.fn(() => revisionsBuilder),
      order: vi.fn(() => revisionsBuilder),
      limit: vi.fn(() => ({ data: [], error: null })),
    };

    const revisionJobsBuilder = {
      insert,
    };

    const from = vi.fn((table: string) => {
      if (table === "books") return booksBuilder;
      if (table === "revision_versions") return revisionsBuilder;
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
      new Request("http://localhost/api/books/book-1/auto-revision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run", trustProfile: "full_trust", maxDecisions: 5000, serverManaged: true }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content?.queued).toBe(true);
    expect(payload.content?.jobId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("full_trust accepts a low-risk draft that the old, lower threshold would have sent to redo", async () => {
    // Regression test for the full_trust acceptance-odds bump. A roll of
    // 0.85 fell inside the OLD low-risk thresholds' "redo" band (accept
    // <0.82, redo <0.95) -- meaning that draft's accepted_text would never
    // have been written even after a full autonomous pass. It must land as
    // "accept" under the new thresholds (accept <0.95).
    const revisionRow = {
      id: "rev-1",
      book_id: "book-1",
      chapter_id: "chapter-1",
      scene_id: null,
      paragraph_id: "para-1",
      original_text: "This is an ordinary paragraph with no continuity concerns at all here.",
      revised_text: "This is an ordinary paragraph with no continuity concerns at all now.",
      revision_notes: null,
      continuity_warnings: [],
      created_at: new Date().toISOString(),
    };

    const booksBuilder = {
      select: vi.fn(() => booksBuilder),
      eq: vi.fn(() => booksBuilder),
      single: vi.fn(async () => ({ data: { id: "book-1", title: "Book" }, error: null })),
    };

    const revisionsBuilder = {
      select: vi.fn(() => revisionsBuilder),
      eq: vi.fn(() => revisionsBuilder),
      not: vi.fn(() => revisionsBuilder),
      order: vi.fn(() => revisionsBuilder),
      limit: vi.fn(async () => ({ data: [revisionRow], error: null })),
    };

    const paragraphsBuilder = {
      select: vi.fn(() => paragraphsBuilder),
      in: vi.fn(async () => ({ data: [], error: null })),
    };

    const from = vi.fn((table: string) => {
      if (table === "books") return booksBuilder;
      if (table === "revision_versions") return revisionsBuilder;
      if (table === "paragraphs") return paragraphsBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.85);
    try {
      const response = await POST(
        new Request("http://localhost/api/books/book-1/auto-revision", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "preview", trustProfile: "full_trust", maxDecisions: 5000 }),
        }),
        { params: Promise.resolve({ bookId: "book-1" }) },
      );

      const payload = await response.json();
      expect(response.status, JSON.stringify(payload)).toBe(200);
      expect(payload.content?.sample?.[0]?.risk).toBe("low");
      expect(payload.content?.sample?.[0]?.action).toBe("accept");
    } finally {
      randomSpy.mockRestore();
    }
  });
});
