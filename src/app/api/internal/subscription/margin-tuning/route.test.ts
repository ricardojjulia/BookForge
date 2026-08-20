import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/internal/subscription/margin-tuning/route";

const { createAdminClientMock, runMock, isManagedSaasDeploymentMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  runMock: vi.fn(),
  isManagedSaasDeploymentMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/subscription/margin-tuning", () => ({ runMarginTuningPass: runMock }));
vi.mock("@/lib/deployment/mode", () => ({ isManagedSaasDeployment: isManagedSaasDeploymentMock }));

describe("margin tuning route", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    isManagedSaasDeploymentMock.mockReturnValue(true);
  });
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
    expect(runMock).not.toHaveBeenCalled();
  });

  it("is a no-op on self-hosted -- never runs the tuning pass", async () => {
    process.env.CRON_SECRET = "correct-secret";
    isManagedSaasDeploymentMock.mockReturnValue(false);

    const response = await GET(request("correct-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: true, reason: "Not a managed-SaaS deployment." });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("runs the tuning pass with a service-role client in managed_saas mode", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const adminClient = { client: "admin" };
    createAdminClientMock.mockReturnValue(adminClient);
    runMock.mockResolvedValue([{ tierId: "starter", status: "applied" }]);

    const response = await GET(request("correct-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcomes: [{ tierId: "starter", status: "applied" }] });
    expect(runMock).toHaveBeenCalledWith(adminClient);
  });

  it("returns a generic failure without leaking the underlying error", async () => {
    process.env.CRON_SECRET = "correct-secret";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createAdminClientMock.mockReturnValue({ client: "admin" });
    runMock.mockRejectedValue(new Error("Database unavailable"));

    const response = await GET(request("correct-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Margin tuning pass failed." });
  });
});

function request(secret: string) {
  return new Request("http://localhost/api/internal/subscription/margin-tuning", {
    headers: { authorization: `Bearer ${secret}` },
  });
}
