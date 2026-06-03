import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/auto-review/process/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("POST /api/books/[bookId]/auto-review/process", () => {
  it("returns launch acknowledgement when launchOnly is true", async () => {
    const jobBuilder = {
      select: vi.fn(() => jobBuilder),
      eq: vi.fn(() => jobBuilder),
      single: vi.fn(async () => ({
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          status: "queued",
          current_stage: "analyze",
          stages_completed: ["analyze"],
          iteration: 0,
          config: null,
          log: [],
          error: null,
          export_id: null,
          created_at: new Date().toISOString(),
          completed_at: null,
        },
        error: null,
      })),
    };

    const from = vi.fn((table: string) => {
      if (table === "auto_review_jobs") return jobBuilder;
      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/auto-review/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: "11111111-1111-4111-8111-111111111111",
          mode: "full_review",
          launchToken: "22222222-2222-4222-8222-222222222222",
          launchOnly: true,
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.accepted).toBe(true);
    expect(payload.launch?.jobId).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload.launch?.launchToken).toBe("22222222-2222-4222-8222-222222222222");
  });
});
