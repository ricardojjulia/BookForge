import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/steward/accounts/[userId]/role/route";

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

function req(body: unknown) {
  return new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
}
function params(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

describe("steward account role route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({});
  });

  it("rejects a non-staff caller", async () => {
    requireStaffMock.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
    const response = await POST(req({ platformRole: "steward" }), params("user-1"));
    expect(response.status).toBe(403);
  });

  it("refuses to let a Steward change their own role", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const response = await POST(req({ platformRole: null }), params("steward-1"));
    expect(response.status).toBe(400);
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("grants the steward role", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn(() => ({ upsert: upsertMock })) });

    const response = await POST(req({ platformRole: "steward" }), params("user-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, platformRole: "steward" });
    expect(upsertMock).toHaveBeenCalledWith({ id: "user-1", platform_role: "steward" });
  });

  it("revokes the steward role by upserting null", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn(() => ({ upsert: upsertMock })) });

    await POST(req({ platformRole: null }), params("user-2"));
    expect(upsertMock).toHaveBeenCalledWith({ id: "user-2", platform_role: null });
  });

  it("rejects an invalid role value", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const response = await POST(req({ platformRole: "superadmin" }), params("user-1"));
    expect(response.status).toBe(400);
  });
});
