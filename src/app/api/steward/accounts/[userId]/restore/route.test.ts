import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/steward/accounts/[userId]/restore/route";

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

describe("steward account restore route", () => {
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

  it("unbans the user and marks the tracking row restored", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockReturnThis();
    const inMock = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue({
      auth: { admin: { updateUserById } },
      from: vi.fn(() => ({ update: updateMock, eq: eqMock, in: inMock })),
    });

    const response = await POST(new Request("http://localhost"), params("user-1"));
    expect(response.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith("user-1", { ban_duration: "none" });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "restored", restored_by: "steward-1" }));
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(inMock).toHaveBeenCalledWith("status", ["pending", "ready_for_purge"]);
  });

  it("fails if the unban call errors", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({
      auth: { admin: { updateUserById: vi.fn().mockResolvedValue({ error: new Error("GoTrue error") }) } },
      from: vi.fn(),
    });

    const response = await POST(new Request("http://localhost"), params("user-1"));
    expect(response.status).toBe(500);
  });
});
