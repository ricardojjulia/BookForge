import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/creativewriter/sync/resolve-conflict/route";

const { mockCreateClient, mockResolveConflict } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockResolveConflict: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/creativewriter-sync/cloud-sync", () => ({
  resolveCreativeWriterConflict: mockResolveConflict,
}));

describe("POST /api/creativewriter/sync/resolve-conflict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a conflict for the linked authenticated account", async () => {
    const supabase = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) } };
    mockCreateClient.mockResolvedValue(supabase);
    mockResolveConflict.mockResolvedValue({
      conflictId: "conflict-change-1",
      resolutionStatus: "resolved_manual",
      cloudVersion: 2,
      syncCursor: "book:book-1:version:2",
    });

    const response = await POST(
      new Request("http://localhost/api/creativewriter/sync/resolve-conflict", {
        method: "POST",
        body: JSON.stringify(resolveBody("user-1")),
      }),
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.content.resolutionStatus).toBe("resolved_manual");
    expect(mockResolveConflict).toHaveBeenCalledWith({
      supabase,
      userId: "user-1",
      request: expect.objectContaining({ conflictId: "conflict-change-1", resolution: "resolved_manual" }),
    });
  });

  it("rejects account mismatch", async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/creativewriter/sync/resolve-conflict", {
        method: "POST",
        body: JSON.stringify(resolveBody("other-user")),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/does not match/);
    expect(mockResolveConflict).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/creativewriter/sync/resolve-conflict", {
        method: "POST",
        body: JSON.stringify(resolveBody("user-1")),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toMatch(/Authentication required/);
    expect(mockResolveConflict).not.toHaveBeenCalled();
  });
});

function resolveBody(accountId: string) {
  return {
    project: {
      localProjectId: "local-1",
      accountId,
      bookforgeBookId: "book-1",
      linkedAt: "2026-08-02T00:00:00.000Z",
      lastCloudVersion: 1,
      syncCursor: "book:book-1:version:1",
    },
    conflictId: "conflict-change-1",
    resolution: "resolved_manual",
    resolvedPayload: { currentText: "Manually merged paragraph." },
  };
}
