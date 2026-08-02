import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/creativewriter/sync/push/route";

const { mockCreateClient, mockPushSync } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockPushSync: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/creativewriter-sync/cloud-sync", () => ({
  pushCreativeWriterSync: mockPushSync,
}));

describe("POST /api/creativewriter/sync/push", () => {
  it("pushes changes for the linked authenticated account", async () => {
    const supabase = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) } };
    mockCreateClient.mockResolvedValue(supabase);
    mockPushSync.mockResolvedValue({ syncCursor: "cursor", cloudVersion: 2, appliedChanges: ["change-1"], conflicts: [], rejectedChanges: [] });

    const response = await POST(
      new Request("http://localhost/api/creativewriter/sync/push", {
        method: "POST",
        body: JSON.stringify(pushBody("user-1")),
      }),
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content.appliedChanges).toEqual(["change-1"]);
    expect(mockPushSync).toHaveBeenCalledWith({ supabase, request: expect.objectContaining({ project: expect.objectContaining({ accountId: "user-1" }) }) });
  });

  it("rejects account mismatch", async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/creativewriter/sync/push", {
        method: "POST",
        body: JSON.stringify(pushBody("other-user")),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/does not match/);
  });
});

function pushBody(accountId: string) {
  return {
    project: {
      localProjectId: "local-1",
      accountId,
      bookforgeBookId: "book-1",
      linkedAt: "2026-08-02T00:00:00.000Z",
    },
    changes: [
      {
        id: "change-1",
        projectId: "local-1",
        entityType: "paragraph",
        entityId: "paragraph-1",
        operation: "update",
        payload: { currentText: "Updated." },
        baseVersion: 1,
        localVersion: 2,
        idempotencyKey: "idem-1",
        createdAt: "2026-08-02T00:00:00.000Z",
      },
    ],
  };
}
