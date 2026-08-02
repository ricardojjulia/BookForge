import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/creativewriter/sync/pull/route";

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

describe("POST /api/creativewriter/sync/pull", () => {
  it("returns pull content for an authenticated user", async () => {
    const supabase = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) } };
    mockCreateClient.mockResolvedValue(supabase);
    mockPullSync.mockResolvedValue({ project: { bookforgeBookId: "book-1" }, syncCursor: "cursor", cloudVersion: 1, changes: [], conflicts: [] });

    const response = await POST(
      new Request("http://localhost/api/creativewriter/sync/pull", {
        method: "POST",
        body: JSON.stringify({ bookId: "book-1", localProjectId: "local-1" }),
      }),
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content.syncCursor).toBe("cursor");
    expect(mockPullSync).toHaveBeenCalledWith({ supabase, userId: "user-1", bookId: "book-1", localProjectId: "local-1" });
  });
});
