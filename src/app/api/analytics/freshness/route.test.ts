import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/analytics/freshness/route";

const mockGetUser = vi.fn();
const mockRange = vi.fn();
const mockOrder = vi.fn(() => ({ range: mockRange }));
const mockGte = vi.fn(() => ({ order: mockOrder }));
const mockEq = vi.fn(() => ({ gte: mockGte }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

describe("GET /api/analytics/freshness", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const response = await GET(new Request("http://localhost/api/analytics/freshness"));
    expect(response.status).toBe(401);
  });

  it("applies pagination and route filters", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    mockRange.mockResolvedValueOnce({ data: [], error: null, count: 0 });

    const response = await GET(
      new Request("http://localhost/api/analytics/freshness?window=7d&routeKey=dashboard%3Abooks&limit=25&offset=50"),
    );

    expect(response.status).toBe(200);
    expect(mockEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mockRange).toHaveBeenCalledWith(50, 74);

    const payload = await response.json();
    expect(payload.window).toBe("7d");
    expect(payload.routeKey).toBe("dashboard:books");
    expect(payload.pagination.limit).toBe(25);
    expect(payload.pagination.offset).toBe(50);
  });

  it("clamps limit above max via schema", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-2" } } });

    const response = await GET(
      new Request("http://localhost/api/analytics/freshness?limit=999"),
    );

    expect(response.status).toBe(400);
  });
});
