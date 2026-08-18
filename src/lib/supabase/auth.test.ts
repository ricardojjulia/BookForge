import { describe, expect, it, vi } from "vitest";
import { requireStaff } from "@/lib/supabase/auth";

function buildSupabase(options: { user?: { id: string } | null; platformRole?: string | null; getUserThrows?: boolean }) {
  return {
    auth: {
      getUser: options.getUserThrows
        ? vi.fn().mockRejectedValue(new Error("network error"))
        : vi.fn().mockResolvedValue({ data: { user: options.user ?? null } }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: options.platformRole !== undefined ? { platform_role: options.platformRole } : null }),
    })),
  };
}

describe("requireStaff", () => {
  it("returns 401 when there is no authenticated user", async () => {
    const supabase = buildSupabase({ user: null });
    const result = await requireStaff(supabase as never);
    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(401);
  });

  it("returns 401 when auth.getUser throws", async () => {
    const supabase = buildSupabase({ getUserThrows: true });
    const result = await requireStaff(supabase as never);
    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const supabase = buildSupabase({ user: { id: "user-1" }, platformRole: null });
    const result = await requireStaff(supabase as never);
    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(403);
  });

  it("returns the user with no response for a steward", async () => {
    const supabase = buildSupabase({ user: { id: "user-1" }, platformRole: "steward" });
    const result = await requireStaff(supabase as never);
    expect(result.user).toEqual({ id: "user-1" });
    expect(result.response).toBeNull();
  });
});
