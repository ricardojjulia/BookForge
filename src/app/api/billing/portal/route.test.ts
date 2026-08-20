import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/billing/portal/route";

const { mockCreateClient, mockCreateAdminClient, mockGetStripeClient, mockIsManagedSaasDeployment } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockGetStripeClient: vi.fn(),
  mockIsManagedSaasDeployment: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: mockGetStripeClient }));
vi.mock("@/lib/deployment/mode", () => ({ isManagedSaasDeployment: mockIsManagedSaasDeployment }));

function sessionClient(user: { id: string } | null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } };
}

function adminClient(subscription: { stripe_customer_id: string | null } | null) {
  const from = vi.fn(() => ({
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: subscription, error: null }) }) }),
  }));
  return { from };
}

function request() {
  return new Request("http://localhost/api/billing/portal", { method: "POST" });
}

describe("billing portal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsManagedSaasDeployment.mockReturnValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it("is unavailable on self-hosted", async () => {
    mockIsManagedSaasDeployment.mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mockCreateClient.mockResolvedValue(sessionClient(null));
    const response = await POST(request());
    expect(response.status).toBe(401);
  });

  it("rejects a user who has never subscribed", async () => {
    mockCreateClient.mockResolvedValue(sessionClient({ id: "user-1" }));
    mockCreateAdminClient.mockReturnValue(adminClient(null));

    const response = await POST(request());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/haven't subscribed/i);
  });

  it("creates a portal session and returns its URL", async () => {
    mockCreateClient.mockResolvedValue(sessionClient({ id: "user-1" }));
    mockCreateAdminClient.mockReturnValue(adminClient({ stripe_customer_id: "cus_1" }));
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/portal_1" });
    mockGetStripeClient.mockReturnValue({ billingPortal: { sessions: { create } } });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe("https://billing.stripe.com/portal_1");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_1" }));
  });

  it("returns a generic failure without leaking the underlying Stripe error", async () => {
    mockCreateClient.mockResolvedValue(sessionClient({ id: "user-1" }));
    mockCreateAdminClient.mockReturnValue(adminClient({ stripe_customer_id: "cus_1" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockGetStripeClient.mockReturnValue({ billingPortal: { sessions: { create: vi.fn().mockRejectedValue(new Error("Stripe API down")) } } });

    const response = await POST(request());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Unable to open billing portal.");
  });
});
