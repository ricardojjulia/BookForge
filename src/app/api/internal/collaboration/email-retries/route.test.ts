import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/internal/collaboration/email-retries/route";

const { createAdminClientMock, dispatchRetriesMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  dispatchRetriesMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/collaboration/email-retries", () => ({
  dispatchCollaborationNotificationEmailRetries: dispatchRetriesMock,
}));

describe("collaboration notification email retry route", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("fails closed without cron configuration", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(request("anything"));
    expect(response.status).toBe(503);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects an incorrect bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const response = await GET(request("wrong-secret"));
    expect(response.status).toBe(401);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("dispatches retries with a service-role client", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const adminClient = { client: "admin" };
    createAdminClientMock.mockReturnValue(adminClient);
    dispatchRetriesMock.mockResolvedValue({ claimed: 2, sent: 1, skipped: 0, failed: 1, hasMore: false });

    const response = await GET(request("correct-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 2, sent: 1, skipped: 0, failed: 1, hasMore: false });
    expect(dispatchRetriesMock).toHaveBeenCalledWith(adminClient);
  });

  it("returns a generic dispatch failure", async () => {
    process.env.CRON_SECRET = "correct-secret";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createAdminClientMock.mockReturnValue({ client: "admin" });
    dispatchRetriesMock.mockRejectedValue(new Error("Database unavailable"));

    const response = await GET(request("correct-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Notification email retry dispatch failed." });
  });
});

function request(secret: string) {
  return new Request("http://localhost/api/internal/collaboration/email-retries", {
    headers: { authorization: `Bearer ${secret}` },
  });
}