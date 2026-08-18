import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/steward/books/[bookId]/transfer/route";

const { mockCreateClient, mockCreateAdminClient, requireStaffMock, findUserIdByEmailMock } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  requireStaffMock: vi.fn(),
  findUserIdByEmailMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/accounts/steward-directory", () => ({ findUserIdByEmail: findUserIdByEmailMock }));
vi.mock("@/lib/supabase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/auth")>()),
  requireStaff: requireStaffMock,
}));

function req(body: unknown) {
  return new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
}
function params(bookId: string) {
  return { params: Promise.resolve({ bookId }) };
}
function findBuilder(data: unknown) {
  return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) };
}

describe("steward book transfer route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({});
  });

  it("rejects a non-staff caller", async () => {
    requireStaffMock.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
    const response = await POST(req({ newOwnerEmail: "a@example.com" }), params("book-1"));
    expect(response.status).toBe(403);
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("returns 404 when the book doesn't exist", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn(() => findBuilder(null)) });

    const response = await POST(req({ newOwnerEmail: "a@example.com" }), params("book-1"));
    expect(response.status).toBe(404);
  });

  it("returns 404 when the target email doesn't match any account", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn(() => findBuilder({ id: "book-1", owner_id: "owner-1", title: "The Forge" })) });
    findUserIdByEmailMock.mockResolvedValue(null);

    const response = await POST(req({ newOwnerEmail: "nobody@example.com" }), params("book-1"));
    expect(response.status).toBe(404);
  });

  it("rejects transferring to the current owner", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn(() => findBuilder({ id: "book-1", owner_id: "owner-1", title: "The Forge" })) });
    findUserIdByEmailMock.mockResolvedValue("owner-1");

    const response = await POST(req({ newOwnerEmail: "same@example.com" }), params("book-1"));
    expect(response.status).toBe(400);
  });

  it("transfers ownership to the resolved account", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const updateMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    let call = 0;
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn(() => {
        call += 1;
        if (call === 1) return findBuilder({ id: "book-1", owner_id: "owner-1", title: "The Forge" });
        return { update: updateMock, eq: eqMock };
      }),
    });
    findUserIdByEmailMock.mockResolvedValue("owner-2");

    const response = await POST(req({ newOwnerEmail: "new@example.com" }), params("book-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, newOwnerId: "owner-2" });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ owner_id: "owner-2" }));
  });
});
