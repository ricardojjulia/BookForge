import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/steward/accounts/[userId]/force-delete/route";

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

describe("steward force-delete route", () => {
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

  it("refuses to force-delete the caller's own account", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const response = await POST(new Request("http://localhost"), params("steward-1"));
    expect(response.status).toBe(400);
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("deletes the user immediately and records a purged audit row", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "spam@example.com" } } }),
          deleteUser,
        },
      },
      from: vi.fn((table: string) =>
        table === "profiles"
          ? { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) }
          : { insert: insertMock },
      ),
    });

    const response = await POST(new Request("http://localhost"), params("user-1"));
    expect(response.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith("user-1");
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      email_at_request: "spam@example.com",
      status: "purged",
      purged_by: "steward-1",
    }));
  });

  it("fails when deleteUser errors", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "a@example.com" } } }),
          deleteUser: vi.fn().mockResolvedValue({ error: new Error("GoTrue error") }),
        },
      },
      from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) })),
    });

    const response = await POST(new Request("http://localhost"), params("user-1"));
    expect(response.status).toBe(500);
  });
});
