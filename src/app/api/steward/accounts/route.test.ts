import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/steward/accounts/route";

const { mockCreateClient, mockCreateAdminClient, requireStaffMock, listStewardAccountsMock } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  requireStaffMock: vi.fn(),
  listStewardAccountsMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/accounts/steward-directory", () => ({ listStewardAccounts: listStewardAccountsMock }));
vi.mock("@/lib/supabase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/auth")>()),
  requireStaff: requireStaffMock,
}));

describe("steward accounts list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({});
  });

  it("rejects a non-staff caller", async () => {
    const forbidden = new Response(null, { status: 403 });
    requireStaffMock.mockResolvedValue({ user: null, response: forbidden });

    const response = await GET(new Request("http://localhost/api/steward/accounts"));
    expect(response.status).toBe(403);
    expect(listStewardAccountsMock).not.toHaveBeenCalled();
  });

  it("delegates to listStewardAccounts with parsed query params", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({ client: "admin" });
    listStewardAccountsMock.mockResolvedValue({ accounts: [{ id: "user-1" }], page: 2, hasMore: false });

    const response = await GET(new Request("http://localhost/api/steward/accounts?search=match&page=2"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ accounts: [{ id: "user-1" }], page: 2, hasMore: false });
    expect(listStewardAccountsMock).toHaveBeenCalledWith({ client: "admin" }, { search: "match", page: 2 });
  });

  it("returns a generic failure on error", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockCreateAdminClient.mockReturnValue({ client: "admin" });
    listStewardAccountsMock.mockRejectedValue(new Error("boom"));

    const response = await GET(new Request("http://localhost/api/steward/accounts"));
    expect(response.status).toBe(500);
  });
});
