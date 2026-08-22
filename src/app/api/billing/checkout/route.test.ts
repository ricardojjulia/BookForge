import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/billing/checkout/route";

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

function adminClient(config: {
  tier?: { id: string; stripe_price_id: string | null } | null;
  subscription?: { status: string; stripe_customer_id: string | null } | null;
}) {
  const insertCalls: Record<string, unknown>[] = [];
  const updateCalls: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    if (table === "subscription_tiers") {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: config.tier ?? null, error: null }) }) }) };
    }
    if (table === "user_subscriptions") {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: config.subscription ?? null, error: null }) }) }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertCalls.push(payload);
          return Promise.resolve({ error: null });
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updateCalls.push(payload);
          return { eq: vi.fn().mockResolvedValue({ error: null }) };
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { admin: { from }, insertCalls, updateCalls };
}

function request(body: unknown) {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("billing checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsManagedSaasDeployment.mockReturnValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it("is unavailable on self-hosted -- never even checks auth", async () => {
    mockIsManagedSaasDeployment.mockReturnValue(false);
    const response = await POST(request({ tierId: "pro" }));
    expect(response.status).toBe(404);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mockCreateClient.mockResolvedValue(sessionClient(null));
    const response = await POST(request({ tierId: "pro" }));
    expect(response.status).toBe(401);
  });

  it("rejects a tier with no stripe_price_id configured", async () => {
    mockCreateClient.mockResolvedValue(sessionClient({ id: "user-1" }));
    const { admin } = adminClient({ tier: { id: "pro", stripe_price_id: null } });
    mockCreateAdminClient.mockReturnValue(admin);

    const response = await POST(request({ tierId: "pro" }));
    expect(response.status).toBe(400);
  });

  it("rejects checkout for an already-active subscriber", async () => {
    mockCreateClient.mockResolvedValue(sessionClient({ id: "user-1" }));
    const { admin } = adminClient({
      tier: { id: "pro", stripe_price_id: "price_pro" },
      subscription: { status: "active", stripe_customer_id: "cus_1" },
    });
    mockCreateAdminClient.mockReturnValue(admin);

    const response = await POST(request({ tierId: "pro" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/already have an active subscription/i);
  });

  it("creates a new Stripe customer for a first-time subscriber (no row at all) and returns the checkout URL", async () => {
    mockCreateClient.mockResolvedValue(sessionClient({ id: "user-1" }));
    const { admin, insertCalls } = adminClient({ tier: { id: "pro", stripe_price_id: "price_pro" }, subscription: null });
    mockCreateAdminClient.mockReturnValue(admin);

    const customersCreate = vi.fn().mockResolvedValue({ id: "cus_new" });
    const sessionsCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session_1" });
    mockGetStripeClient.mockReturnValue({ customers: { create: customersCreate }, checkout: { sessions: { create: sessionsCreate } } });

    const response = await POST(request({ tierId: "pro" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.com/session_1");
    expect(customersCreate).toHaveBeenCalledWith(expect.objectContaining({ metadata: { supabase_user_id: "user-1" } }));
    expect(insertCalls).toEqual([expect.objectContaining({ user_id: "user-1", stripe_customer_id: "cus_new", status: "incomplete" })]);
    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: "subscription",
      customer: "cus_new",
      line_items: [{ price: "price_pro", quantity: 1 }],
      subscription_data: { metadata: { supabase_user_id: "user-1" } },
    }));
  });

  it("reuses an existing Stripe customer instead of creating a new one", async () => {
    mockCreateClient.mockResolvedValue(sessionClient({ id: "user-1" }));
    const { admin, insertCalls, updateCalls } = adminClient({
      tier: { id: "pro", stripe_price_id: "price_pro" },
      subscription: { status: "canceled", stripe_customer_id: "cus_existing" },
    });
    mockCreateAdminClient.mockReturnValue(admin);

    const customersCreate = vi.fn();
    const sessionsCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session_2" });
    mockGetStripeClient.mockReturnValue({ customers: { create: customersCreate }, checkout: { sessions: { create: sessionsCreate } } });

    const response = await POST(request({ tierId: "pro" }));
    expect(response.status).toBe(200);
    expect(customersCreate).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_existing" }));
  });

  it("does not overwrite an existing trial's status when the user starts checkout without a Stripe customer yet", async () => {
    mockCreateClient.mockResolvedValue(sessionClient({ id: "user-1" }));
    const { admin, updateCalls } = adminClient({
      tier: { id: "pro", stripe_price_id: "price_pro" },
      subscription: { status: "trialing", stripe_customer_id: null },
    });
    mockCreateAdminClient.mockReturnValue(admin);

    const customersCreate = vi.fn().mockResolvedValue({ id: "cus_new" });
    const sessionsCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session_3" });
    mockGetStripeClient.mockReturnValue({ customers: { create: customersCreate }, checkout: { sessions: { create: sessionsCreate } } });

    const response = await POST(request({ tierId: "pro" }));
    expect(response.status).toBe(200);
    expect(updateCalls).toEqual([expect.objectContaining({ stripe_customer_id: "cus_new" })]);
    expect(updateCalls[0]).not.toHaveProperty("status");
  });

  it("returns a generic failure without leaking the underlying Stripe error", async () => {
    mockCreateClient.mockResolvedValue(sessionClient({ id: "user-1" }));
    const { admin } = adminClient({ tier: { id: "pro", stripe_price_id: "price_pro" }, subscription: null });
    mockCreateAdminClient.mockReturnValue(admin);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockGetStripeClient.mockReturnValue({
      customers: { create: vi.fn().mockRejectedValue(new Error("Stripe API down")) },
      checkout: { sessions: { create: vi.fn() } },
    });

    const response = await POST(request({ tierId: "pro" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Unable to start checkout.");
  });
});
