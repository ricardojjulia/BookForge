import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/steward/accounts/create/route";

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

describe("steward account create route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({});
  });

  it("rejects a non-staff caller", async () => {
    requireStaffMock.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
    const response = await POST(req({ email: "a@example.com", password: "password123" }));
    expect(response.status).toBe(403);
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const response = await POST(req({ email: "not-an-email", password: "short" }));
    expect(response.status).toBe(400);
  });

  it("creates the account without a profile upsert when no display name is given", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "new-user", email: "a@example.com" } }, error: null });
    const fromMock = vi.fn();
    mockCreateAdminClient.mockReturnValue({ auth: { admin: { createUser } }, from: fromMock });

    const response = await POST(req({ email: "a@example.com", password: "password123" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, id: "new-user", email: "a@example.com" });
    expect(createUser).toHaveBeenCalledWith({ email: "a@example.com", password: "password123", email_confirm: true });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("upserts a display name when provided", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "new-user", email: "a@example.com" } }, error: null });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue({ auth: { admin: { createUser } }, from: vi.fn(() => ({ upsert: upsertMock })) });

    await POST(req({ email: "a@example.com", password: "password123", displayName: "New Author" }));
    expect(upsertMock).toHaveBeenCalledWith({ id: "new-user", display_name: "New Author" });
  });

  it("fails when createUser errors", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({ auth: { admin: { createUser: vi.fn().mockResolvedValue({ data: null, error: new Error("email exists") }) } } });

    const response = await POST(req({ email: "a@example.com", password: "password123" }));
    expect(response.status).toBe(500);
  });
});
