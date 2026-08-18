import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { requestAccountDeletion } from "@/lib/accounts/deletion";

function buildAdmin(options: { updateUserById?: ReturnType<typeof vi.fn>; insertMock?: ReturnType<typeof vi.fn> } = {}) {
  return {
    auth: { admin: { updateUserById: options.updateUserById || vi.fn().mockResolvedValue({ error: null }) } },
    from: vi.fn(() => ({ insert: options.insertMock || vi.fn().mockResolvedValue({ error: null }) })),
  };
}

describe("requestAccountDeletion", () => {
  const originalNow = Date.now;
  beforeEach(() => { Date.now = () => new Date("2026-08-18T00:00:00.000Z").getTime(); });
  afterEach(() => { Date.now = originalNow; });

  it("bans for 30 days and records a tracking row", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const admin = buildAdmin({ updateUserById, insertMock });

    const result = await requestAccountDeletion(admin as never, { userId: "user-1", email: "a@example.com", displayName: "Author" });

    expect(result).toEqual({ purgeAfter: "2026-09-17T00:00:00.000Z" });
    expect(updateUserById).toHaveBeenCalledWith("user-1", { ban_duration: "720h" });
    expect(insertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      email_at_request: "a@example.com",
      display_name_at_request: "Author",
      purge_after: "2026-09-17T00:00:00.000Z",
    });
  });

  it("propagates a ban failure without inserting a tracking row", async () => {
    const insertMock = vi.fn();
    const admin = buildAdmin({ updateUserById: vi.fn().mockResolvedValue({ error: new Error("GoTrue down") }), insertMock });

    await expect(requestAccountDeletion(admin as never, { userId: "user-1", email: null, displayName: null })).rejects.toThrow("GoTrue down");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("propagates a tracking-row insert failure", async () => {
    const admin = buildAdmin({ insertMock: vi.fn().mockResolvedValue({ error: new Error("insert failed") }) });
    await expect(requestAccountDeletion(admin as never, { userId: "user-1", email: null, displayName: null })).rejects.toThrow("insert failed");
  });
});
