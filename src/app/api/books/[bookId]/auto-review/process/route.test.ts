import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/auto-review/process/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("POST /api/books/[bookId]/auto-review/process", () => {
  it("accepts queued revisionJobId for rewrite-execute handoff", async () => {
    const completedStages = [
      "analyze",
      "summarize",
      "critic_baseline:story_structure",
      "critic_baseline:prose_quality",
      "critic_baseline:continuity",
      "critic_baseline:character_depth",
      "critic_baseline:market_fit",
      "critic_baseline:contemporary_view",
      "critic_baseline:revision_priorities",
      "critic_baseline:dialogue_density",
      "rewrite_plan",
      "auto_accept",
      "drift_check",
      "critic_post:story_structure",
      "critic_post:prose_quality",
      "critic_post:continuity",
      "critic_post:character_depth",
      "critic_post:market_fit",
      "critic_post:contemporary_view",
      "critic_post:revision_priorities",
      "critic_post:dialogue_density",
      "critics_check",
      "export",
      "mark_finished",
    ];

    const initialJob = {
      id: "11111111-1111-4111-8111-111111111111",
      status: "running",
      current_stage: "rewrite_execute",
      stages_completed: completedStages,
      iteration: 0,
      config: null,
      log: [],
      error: null,
      export_id: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    const from = vi.fn((table: string) => {
      if (table === "auto_review_jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: initialJob, error: null })),
                })),
                single: vi.fn(async () => ({ data: initialJob, error: null })),
              })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
    });

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const payload = init?.body ? JSON.parse(String(init.body)) : {};

      if (url.includes("/rewrite-execute") && payload.serverManaged) {
        return new Response(
          JSON.stringify({ content: { revisionJobId: "33333333-3333-4333-8333-333333333333", queued: true } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/rewrite-execute") && payload.jobId) {
        expect(payload.jobId).toBe("33333333-3333-4333-8333-333333333333");
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    const response = await POST(
      new Request("http://localhost/api/books/book-1/auto-review/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: "11111111-1111-4111-8111-111111111111",
          mode: "full_review",
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

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
