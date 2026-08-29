import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/steward/accounts/[userId]/extend/route";

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

function req(body?: unknown) {
  return new Request("http://localhost", { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
}
function params(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

describe("steward account extend route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({});
    // The route calls `new Date()` (no-arg), which reads the real system
    // clock regardless of a `Date.now` override -- only vi.useFakeTimers
    // actually freezes it.
    vi.useFakeTimers({ now: new Date("2026-08-18T00:00:00.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a non-staff caller", async () => {
    requireStaffMock.mockResolvedValue({ user: null, response: new Response(null, { status: 403 }) });
    const response = await POST(req(), params("user-1"));
    expect(response.status).toBe(403);
  });

  it("returns 404 when there is no active deletion request", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    });

    const response = await POST(req({}), params("user-1"));
    expect(response.status).toBe(404);
  });

  it("extends purge_after by the requested number of days and resets status to pending", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const updateMock = vi.fn().mockReturnThis();
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    let call = 0;
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn(() => {
        call += 1;
        if (call === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "req-1", purge_after: "2026-08-20T00:00:00.000Z" }, error: null }),
          };
        }
        return { update: updateMock, eq: updateEqMock };
      }),
    });

    const response = await POST(req({ extendByDays: 14 }), params("user-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.purgeAfter).toBe("2026-09-03T00:00:00.000Z");
    expect(updateMock).toHaveBeenCalledWith({ purge_after: "2026-09-03T00:00:00.000Z", status: "pending" });
  });

  it("rejects an out-of-range extension", async () => {
    requireStaffMock.mockResolvedValue({ user: { id: "steward-1" }, response: null });
    const response = await POST(req({ extendByDays: 9999 }), params("user-1"));
    expect(response.status).toBe(400);
  });
});
