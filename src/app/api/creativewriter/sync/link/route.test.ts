import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/creativewriter/sync/link/route";

const { mockCreateClient, mockPullSync } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockPullSync: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/creativewriter-sync/cloud-sync", () => ({
  pullCreativeWriterSync: mockPullSync,
}));

describe("POST /api/creativewriter/sync/link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("links a local CreativeWriter project to an authenticated BookForge book", async () => {
    const supabase = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) } };
    mockCreateClient.mockResolvedValue(supabase);
    mockPullSync.mockResolvedValue({
      project: { localProjectId: "local-1", accountId: "user-1", bookforgeBookId: "book-1" },
      syncCursor: "cursor",
      cloudVersion: 1,
      changes: [],
      conflicts: [],
    });

    const response = await POST(
      new Request("http://localhost/api/creativewriter/sync/link", {
        method: "POST",
        body: JSON.stringify({ bookId: "book-1", localProjectId: "local-1" }),
      }),
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content.project.bookforgeBookId).toBe("book-1");
    expect(mockPullSync).toHaveBeenCalledWith({ supabase, userId: "user-1", bookId: "book-1", localProjectId: "local-1" });
  });

  it("requires authentication", async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/creativewriter/sync/link", {
        method: "POST",
        body: JSON.stringify({ bookId: "book-1", localProjectId: "local-1" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toMatch(/Authentication required/);
    expect(mockPullSync).not.toHaveBeenCalled();
  });
});
