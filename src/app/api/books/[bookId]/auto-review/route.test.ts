import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/books/[bookId]/auto-review/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("POST /api/books/[bookId]/auto-review", () => {
  it("queues an auto-review job when serverManaged is true", async () => {
    const insertSingle = vi.fn(async () => ({ data: { id: "11111111-1111-4111-8111-111111111111" }, error: null }));
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));

    const cancelBuilder = {
      update: vi.fn(() => cancelBuilder),
      eq: vi.fn(() => cancelBuilder),
      in: vi.fn(async () => ({ error: null })),
      insert,
    };

    const booksBuilder = {
      select: vi.fn(() => booksBuilder),
      eq: vi.fn(() => booksBuilder),
      single: vi.fn(async () => ({ data: { id: "book-1", title: "Book" }, error: null })),
    };

    const chaptersBuilder = {
      select: vi.fn(() => chaptersBuilder),
      eq: vi.fn(async () => ({ count: 3 })),
    };

    const paragraphsBuilder = {
      select: vi.fn(() => paragraphsBuilder),
      eq: vi.fn(async () => ({ count: 120 })),
    };

    const from = vi.fn((table: string) => {
      if (table === "books") return booksBuilder;
      if (table === "chapters") return chaptersBuilder;
      if (table === "paragraphs") return paragraphsBuilder;
      if (table === "auto_review_jobs") return cancelBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/auto-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "full_review", serverManaged: true }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content?.queued).toBe(true);
    expect(payload.content?.jobId).toBe("11111111-1111-4111-8111-111111111111");
  });
});

describe("GET /api/books/[bookId]/auto-review", () => {
  it("reports acceptedParagraphCount alongside the latest job so a client can detect a since-reset manuscript", async () => {
    const completedJob = {
      id: "job-1",
      book_id: "book-1",
      mode: "full_review",
      status: "completed",
      current_stage: "mark_finished",
      stages_completed: [],
      iteration: 0,
      config: {},
      log: [],
      error: null,
      export_id: null,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    const jobsBuilder = {
      select: vi.fn(() => jobsBuilder),
      eq: vi.fn(() => jobsBuilder),
      order: vi.fn(() => jobsBuilder),
      limit: vi.fn(() => jobsBuilder),
      maybeSingle: vi.fn(async () => ({ data: completedJob, error: null })),
    };

    const paragraphsBuilder = {
      select: vi.fn(() => paragraphsBuilder),
      eq: vi.fn(() => paragraphsBuilder),
      not: vi.fn(async () => ({ count: 0 })),
    };

    const from = vi.fn((table: string) => {
      if (table === "auto_review_jobs") return jobsBuilder;
      if (table === "paragraphs") return paragraphsBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const response = await GET(
      new Request("http://localhost/api/books/book-1/auto-review"),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.job?.status).toBe("completed");
    expect(payload.acceptedParagraphCount).toBe(0);
  });
});
