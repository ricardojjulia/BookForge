import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/steward/accounts/[userId]/delete/route";

const { mockCreateClient, mockCreateAdminClient, requireStaffMock, requestAccountDeletionMock } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  requireStaffMock: vi.fn(),
  requestAccountDeletionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/accounts/deletion", () => ({ requestAccountDeletion: requestAccountDeletionMock }));
vi.mock("@/lib/supabase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/auth")>()),
  requireStaff: requireStaffMock,
}));

function params(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

describe("steward-initiated account delete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({});
  });

  it("rejects a non-staff caller", async () => {
    requireStaffMock.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
    const response = await POST(new Request("http://localhost"), params("user-1"));
    expect(response.status).toBe(403);
    expect(requestAccountDeletionMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the target account doesn't exist", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: null, error: new Error("not found") }) } },
      from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) })),
    });

    const response = await POST(new Request("http://localhost"), params("user-1"));
    expect(response.status).toBe(404);
  });

  it("starts the ban-based deletion flow for the target account", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { id: "user-1", email: "a@example.com" } }, error: null }) } },
      from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { display_name: "Author" } }) })),
    });
    requestAccountDeletionMock.mockResolvedValue({ purgeAfter: "2026-09-17T00:00:00.000Z" });

    const response = await POST(new Request("http://localhost"), params("user-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, purgeAfter: "2026-09-17T00:00:00.000Z" });
    expect(requestAccountDeletionMock).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "user-1", email: "a@example.com", displayName: "Author" },
    );
  });
});
