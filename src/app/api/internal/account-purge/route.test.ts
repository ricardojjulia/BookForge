import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/internal/account-purge/route";

const { createAdminClientMock, flagMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  flagMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/accounts/purge-queue", () => ({ flagAccountsReadyForPurge: flagMock }));

describe("account purge flagging route", () => {
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
    expect(flagMock).not.toHaveBeenCalled();
  });

  it("flags due accounts with a service-role client", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const adminClient = { client: "admin" };
    createAdminClientMock.mockReturnValue(adminClient);
    flagMock.mockResolvedValue({ flagged: 3 });

    const response = await GET(request("correct-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ flagged: 3 });
    expect(flagMock).toHaveBeenCalledWith(adminClient);
  });

  it("returns a generic failure without leaking the underlying error", async () => {
    process.env.CRON_SECRET = "correct-secret";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createAdminClientMock.mockReturnValue({ client: "admin" });
    flagMock.mockRejectedValue(new Error("Database unavailable"));

    const response = await GET(request("correct-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Account purge flagging failed." });
  });
});

function request(secret: string) {
  return new Request("http://localhost/api/internal/account-purge", {
    headers: { authorization: `Bearer ${secret}` },
  });
}
