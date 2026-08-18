import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/steward/books/route";

const { mockCreateClient, mockCreateAdminClient, requireStaffMock, listStewardBooksMock } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  requireStaffMock: vi.fn(),
  listStewardBooksMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/accounts/steward-directory", () => ({ listStewardBooks: listStewardBooksMock }));
vi.mock("@/lib/supabase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/auth")>()),
  requireStaff: requireStaffMock,
}));

describe("steward books list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({});
  });

  it("rejects a non-staff caller", async () => {
    requireStaffMock.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
    const response = await GET(new Request("http://localhost/api/steward/books"));
    expect(response.status).toBe(403);
    expect(listStewardBooksMock).not.toHaveBeenCalled();
  });

  it("delegates to listStewardBooks with parsed query params", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({ client: "admin" });
    listStewardBooksMock.mockResolvedValue({ books: [{ id: "book-1" }], page: 1, hasMore: false });

    const response = await GET(new Request("http://localhost/api/steward/books?search=Forge"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ books: [{ id: "book-1" }], page: 1, hasMore: false });
    expect(listStewardBooksMock).toHaveBeenCalledWith({ client: "admin" }, { search: "Forge", page: undefined, ownerId: undefined });
  });

  it("passes an ownerId filter through when provided", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({ client: "admin" });
    listStewardBooksMock.mockResolvedValue({ books: [], page: 1, hasMore: false });

    await GET(new Request("http://localhost/api/steward/books?ownerId=user-1"));
    expect(listStewardBooksMock).toHaveBeenCalledWith({ client: "admin" }, { search: undefined, page: undefined, ownerId: "user-1" });
  });
});
