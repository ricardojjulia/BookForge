import { describe, expect, it, vi } from "vitest";
import { findUserIdByEmail, listStewardAccounts, listStewardBooks } from "@/lib/accounts/steward-directory";

describe("listStewardAccounts", () => {
  it("merges active deletion-request status into the account list", async () => {
    const admin = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: {
              users: [
                { id: "user-1", email: "a@example.com", created_at: "2026-01-01", last_sign_in_at: null, banned_until: "2026-09-17T00:00:00.000Z" },
                { id: "user-2", email: "b@example.com", created_at: "2026-01-02", last_sign_in_at: "2026-08-01", banned_until: null },
              ],
            },
            error: null,
          }),
        },
      },
      from: vi.fn((table: string) => {
        if (table === "profiles") return { select: vi.fn().mockResolvedValue({ data: [{ id: "user-1", platform_role: "steward" }], error: null }) };
        if (table === "books") return { select: vi.fn().mockResolvedValue({ data: [{ owner_id: "user-1" }, { owner_id: "user-1" }, { owner_id: "user-2" }], error: null }) };
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{ user_id: "user-1", status: "pending", requested_at: "2026-08-18", purge_after: "2026-09-17T00:00:00.000Z" }],
            error: null,
          }),
        };
      }),
    };

    const result = await listStewardAccounts(admin as never);
    expect(result.accounts).toEqual([
      { id: "user-1", email: "a@example.com", createdAt: "2026-01-01", lastSignInAt: null, bannedUntil: "2026-09-17T00:00:00.000Z", deletionStatus: "pending", purgeAfter: "2026-09-17T00:00:00.000Z", platformRole: "steward", bookCount: 2 },
      { id: "user-2", email: "b@example.com", createdAt: "2026-01-02", lastSignInAt: "2026-08-01", bannedUntil: null, deletionStatus: null, purgeAfter: null, platformRole: null, bookCount: 1 },
    ]);
  });

  it("filters by search within the current page", async () => {
    const admin = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: { users: [{ id: "user-1", email: "match@example.com" }, { id: "user-2", email: "other@example.com" }] },
            error: null,
          }),
        },
      },
      from: vi.fn((table: string) => {
        if (table === "profiles") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        if (table === "books") return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }),
    };

    const result = await listStewardAccounts(admin as never, { search: "match" });
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].email).toBe("match@example.com");
  });
});

describe("listStewardBooks", () => {
  it("joins the owner's email onto each book", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [{ id: "book-1", title: "The Forge", author_name: "Author", status: "draft", owner_id: "user-1", updated_at: "2026-08-18" }],
          error: null,
          count: 1,
        }),
      })),
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: "user-1", email: "owner@example.com" }] }, error: null }),
        },
      },
    };

    const result = await listStewardBooks(admin as never);
    expect(result.books).toEqual([
      { id: "book-1", title: "The Forge", author_name: "Author", status: "draft", owner_id: "user-1", updated_at: "2026-08-18", ownerEmail: "owner@example.com" },
    ]);
  });

  it("filters by ownerId when provided", async () => {
    const eqMock = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: eqMock,
      })),
      auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }) } },
    };

    await listStewardBooks(admin as never, { ownerId: "user-1" });
    expect(eqMock).toHaveBeenCalledWith("owner_id", "user-1");
  });
});

describe("findUserIdByEmail", () => {
  it("finds a case-insensitive exact match on the first page", async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: { users: [{ id: "user-1", email: "Match@Example.com" }, { id: "user-2", email: "other@example.com" }] },
      error: null,
    });
    const admin = { auth: { admin: { listUsers } } };

    await expect(findUserIdByEmail(admin as never, "match@example.com")).resolves.toBe("user-1");
    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  it("returns null when no page contains a match", async () => {
    const listUsers = vi.fn().mockResolvedValue({ data: { users: [{ id: "user-1", email: "other@example.com" }] }, error: null });
    const admin = { auth: { admin: { listUsers } } };

    await expect(findUserIdByEmail(admin as never, "missing@example.com")).resolves.toBeNull();
  });

  it("pages forward until it finds a match on a later page", async () => {
    const listUsers = vi.fn()
      .mockResolvedValueOnce({ data: { users: Array.from({ length: 1000 }, (_, i) => ({ id: `u${i}`, email: `u${i}@example.com` })) }, error: null })
      .mockResolvedValueOnce({ data: { users: [{ id: "target", email: "target@example.com" }] }, error: null });
    const admin = { auth: { admin: { listUsers } } };

    await expect(findUserIdByEmail(admin as never, "target@example.com")).resolves.toBe("target");
    expect(listUsers).toHaveBeenCalledTimes(2);
  });
});
