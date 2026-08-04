import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/internal/creativewriter/assignment-reminders/route";

const { createAdminClientMock, dispatchRemindersMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  dispatchRemindersMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/creativewriter/assignment-reminders", () => ({
  dispatchCreativeWriterAssignmentReminders: dispatchRemindersMock,
}));

describe("CreativeWriter assignment reminder route", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("fails closed when cron authentication is not configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request("anything"));

    expect(response.status).toBe(503);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects an incorrect bearer token before creating an admin client", async () => {
    process.env.CRON_SECRET = "correct-secret";

    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("dispatches reminders with a service-role client", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const adminClient = { client: "admin" };
    createAdminClientMock.mockReturnValue(adminClient);
    dispatchRemindersMock.mockResolvedValue({ notified: 2, emailsSent: 1, hasMore: false });

    const response = await GET(request("correct-secret"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notified: 2, emailsSent: 1, hasMore: false });
    expect(dispatchRemindersMock).toHaveBeenCalledWith(adminClient);
  });

  it("returns a generic failure when dispatch fails", async () => {
    process.env.CRON_SECRET = "correct-secret";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createAdminClientMock.mockReturnValue({ client: "admin" });
    dispatchRemindersMock.mockRejectedValue(new Error("Database unavailable"));

    const response = await GET(request("correct-secret"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Assignment reminder dispatch failed." });
  });
});

function request(secret: string) {
  return new Request("http://localhost/api/internal/creativewriter/assignment-reminders", {
    headers: { authorization: `Bearer ${secret}` },
  });
}