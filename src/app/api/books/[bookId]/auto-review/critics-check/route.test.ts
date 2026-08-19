import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/books/[bookId]/auto-review/critics-check/route";

const { mockCreateClient, mockExtractCriticScore } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockExtractCriticScore: vi.fn((content: Record<string, unknown> | null) => {
    if (!content) return null;
    const score = content.score;
    return typeof score === "number" ? score : null;
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/critic/score", () => ({
  extractCriticScore: mockExtractCriticScore,
}));

describe("GET /api/books/[bookId]/auto-review/critics-check", () => {
  it("limits report query to baseline and post critic report types", async () => {
    const inSpy = vi.fn<(column: string, values: string[]) => { order: () => Promise<{ data: never[]; error: null }> }>(
      () => ({ order: vi.fn(async () => ({ data: [], error: null })) }),
    );
    const eqSpy = vi.fn(() => ({ in: inSpy }));
    const selectSpy = vi.fn(() => ({ eq: eqSpy }));

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn(() => ({ select: selectSpy })),
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ bookId: "book-1" }),
    });

    expect(response.status).toBe(200);
    expect(inSpy).toHaveBeenCalledTimes(1);
    const [column, values] = inSpy.mock.calls[0] as [string, string[]];
    expect(column).toBe("report_type");
    expect(values.length).toBe(16);
    expect(values).toContain("critic_post:story_structure");
    expect(values).toContain("critic:story_structure");
    expect(values).toContain("critic_post:revision_priorities");
    expect(values).toContain("critic:revision_priorities");
  });

  it("returns expected gate payload with post and baseline scores", async () => {
    const reports = [
      { report_type: "critic_post:story_structure", content: { score: 78 }, created_at: "2026-01-03" },
      { report_type: "critic:story_structure", content: { score: 65 }, created_at: "2026-01-01" },
      { report_type: "critic_post:continuity", content: { score: 82 }, created_at: "2026-01-02" },
      { report_type: "critic:continuity", content: { score: 71 }, created_at: "2025-12-31" },
    ];

    const orderSpy = vi.fn(async () => ({ data: reports, error: null }));
    const inSpy = vi.fn(() => ({ order: orderSpy }));
    const eqSpy = vi.fn(() => ({ in: inSpy }));
    const selectSpy = vi.fn(() => ({ eq: eqSpy }));

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn(() => ({ select: selectSpy })),
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ bookId: "book-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.total).toBe(8);
    expect(payload.greenCount).toBe(2);
    expect(payload.allGreen).toBe(false);
    expect(payload.avgScore).toBe(80);
    expect(payload.threshold).toBe(70);
    expect(payload.scores.story_structure).toBe(78);
    expect(payload.scores.continuity).toBe(82);
    expect(payload.baselineScores.story_structure).toBe(65);
    expect(payload.baselineScores.continuity).toBe(71);
    expect(payload.scores.prose_quality).toBeNull();
    expect(payload.baselineScores.prose_quality).toBeNull();
  });
});
