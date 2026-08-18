import { describe, expect, it, vi } from "vitest";
import { flagAccountsReadyForPurge } from "@/lib/accounts/purge-queue";

describe("flagAccountsReadyForPurge", () => {
  it("flips pending rows past purge_after to ready_for_purge and reports the count", async () => {
    const selectMock = vi.fn().mockResolvedValue({
      data: [{ id: "req-1", user_id: "user-1", email_at_request: "a@example.com" }],
      error: null,
    });
    const lteMock = vi.fn(() => ({ select: selectMock }));
    const eqMock = vi.fn(() => ({ lte: lteMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    const supabase = { from: vi.fn(() => ({ update: updateMock })) };
    const now = new Date("2026-09-17T00:00:00.000Z");

    await expect(flagAccountsReadyForPurge(supabase as never, now)).resolves.toEqual({ flagged: 1 });

    expect(supabase.from).toHaveBeenCalledWith("account_deletion_requests");
    expect(updateMock).toHaveBeenCalledWith({ status: "ready_for_purge" });
    expect(eqMock).toHaveBeenCalledWith("status", "pending");
    expect(lteMock).toHaveBeenCalledWith("purge_after", "2026-09-17T00:00:00.000Z");
  });

  it("reports zero when nothing is due", async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            lte: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: [], error: null }) })),
          })),
        })),
      })),
    };

    await expect(flagAccountsReadyForPurge(supabase as never)).resolves.toEqual({ flagged: 0 });
  });

  it("propagates a database error", async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            lte: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: null, error: new Error("db down") }) })),
          })),
        })),
      })),
    };

    await expect(flagAccountsReadyForPurge(supabase as never)).rejects.toThrow("db down");
  });
});
