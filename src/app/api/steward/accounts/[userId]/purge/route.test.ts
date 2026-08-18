import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/steward/accounts/[userId]/purge/route";

const { mockCreateClient, mockCreateAdminClient, requireStaffMock } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  requireStaffMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/supabase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/auth")>()),
  requireStaff: requireStaffMock,
}));

function params(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

function findBuilder(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("steward account purge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({});
  });

  it("rejects a non-staff caller", async () => {
    requireStaffMock.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
    const response = await POST(new Request("http://localhost"), params("user-1"));
    expect(response.status).toBe(403);
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("refuses to purge an account that isn't flagged ready_for_purge", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn(() => findBuilder(null)),
      auth: { admin: { deleteUser: vi.fn() } },
    });

    const response = await POST(new Request("http://localhost"), params("user-1"));
    expect(response.status).toBe(409);
    expect(mockCreateAdminClient().auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the user and marks the tracking row purged", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    let call = 0;
    mockCreateAdminClient.mockReturnValue({
      auth: { admin: { deleteUser } },
      from: vi.fn(() => {
        call += 1;
        if (call === 1) return findBuilder({ id: "req-1" });
        return { update: updateMock, eq: eqMock };
      }),
    });

    const response = await POST(new Request("http://localhost"), params("user-1"));
    expect(response.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith("user-1");
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "purged" }));
  });

  it("records purge_error and fails when deleteUser errors", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const deleteUser = vi.fn().mockResolvedValue({ error: new Error("GoTrue unavailable") });
    const updateMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    let call = 0;
    mockCreateAdminClient.mockReturnValue({
      auth: { admin: { deleteUser } },
      from: vi.fn(() => {
        call += 1;
        if (call === 1) return findBuilder({ id: "req-1" });
        return { update: updateMock, eq: eqMock };
      }),
    });

    const response = await POST(new Request("http://localhost"), params("user-1"));
    expect(response.status).toBe(500);
    expect(updateMock).toHaveBeenCalledWith({ purge_error: "GoTrue unavailable" });
  });
});
