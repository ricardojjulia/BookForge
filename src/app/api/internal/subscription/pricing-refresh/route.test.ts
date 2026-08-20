import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/internal/subscription/pricing-refresh/route";

const { createAdminClientMock, refreshMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/subscription/pricing-refresh", () => ({ refreshModelPricingFromOpenRouter: refreshMock }));

describe("model pricing refresh route", () => {
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
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes pricing with a service-role client", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const adminClient = { client: "admin" };
    createAdminClientMock.mockReturnValue(adminClient);
    refreshMock.mockResolvedValue([{ model: "deepseek/deepseek-v4-pro" }]);

    const response = await GET(request("correct-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ changed: 1, changes: [{ model: "deepseek/deepseek-v4-pro" }] });
    expect(refreshMock).toHaveBeenCalledWith(adminClient);
  });

  it("returns a generic failure without leaking the underlying error", async () => {
    process.env.CRON_SECRET = "correct-secret";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createAdminClientMock.mockReturnValue({ client: "admin" });
    refreshMock.mockRejectedValue(new Error("OpenRouter unreachable"));

    const response = await GET(request("correct-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Model pricing refresh failed." });
  });
});

function request(secret: string) {
  return new Request("http://localhost/api/internal/subscription/pricing-refresh", {
    headers: { authorization: `Bearer ${secret}` },
  });
}
