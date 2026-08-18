import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/account/delete/route";

const { mockCreateClient, mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }));

describe("account delete route", () => {
  const originalNow = Date.now;

  beforeEach(() => {
    vi.clearAllMocks();
    Date.now = () => new Date("2026-08-18T00:00:00.000Z").getTime();
  });

  afterEach(() => {
    Date.now = originalNow;
  });

  it("requires authentication", async () => {
    mockCreateClient.mockResolvedValue(buildSessionClient({ user: null }));
    mockCreateAdminClient.mockReturnValue(buildAdminClient());

    const response = await POST();
    expect(response.status).toBe(401);
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("bans the user and records a deletion request instead of hard-deleting", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const sessionClient = buildSessionClient({
      user: { id: "user-1", email: "author@example.com" },
      displayName: "Author One",
      signOut,
    });
    mockCreateClient.mockResolvedValue(sessionClient);

    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const adminClient = buildAdminClient({ updateUserById, insertMock });
    mockCreateAdminClient.mockReturnValue(adminClient);

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, purgeAfter: "2026-09-17T00:00:00.000Z" });

    expect(updateUserById).toHaveBeenCalledWith("user-1", { ban_duration: "720h" });
    expect(adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();

    expect(insertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      email_at_request: "author@example.com",
      display_name_at_request: "Author One",
      purge_after: "2026-09-17T00:00:00.000Z",
    });

    expect(signOut).toHaveBeenCalled();
  });

  it("fails without banning further if the ban call itself errors", async () => {
    mockCreateClient.mockResolvedValue(buildSessionClient({ user: { id: "user-1", email: "a@example.com" } }));
    const insertMock = vi.fn();
    const updateUserById = vi.fn().mockResolvedValue({ error: new Error("GoTrue unavailable") });
    mockCreateAdminClient.mockReturnValue(buildAdminClient({ updateUserById, insertMock }));

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe("GoTrue unavailable");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("fails if the tracking row cannot be inserted", async () => {
    mockCreateClient.mockResolvedValue(buildSessionClient({ user: { id: "user-1", email: "a@example.com" } }));
    const insertMock = vi.fn().mockResolvedValue({ error: new Error("insert failed") });
    mockCreateAdminClient.mockReturnValue(buildAdminClient({ insertMock }));

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe("insert failed");
  });
});

function buildSessionClient(options: {
  user: { id: string; email: string } | null;
  displayName?: string;
  signOut?: ReturnType<typeof vi.fn>;
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: options.user } }),
      signOut: options.signOut || vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: options.displayName ? { display_name: options.displayName } : null }),
    })),
  };
}

function buildAdminClient(options: {
  updateUserById?: ReturnType<typeof vi.fn>;
  insertMock?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    auth: {
      admin: {
        updateUserById: options.updateUserById || vi.fn().mockResolvedValue({ error: null }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    from: vi.fn(() => ({
      insert: options.insertMock || vi.fn().mockResolvedValue({ error: null }),
    })),
  };
}
