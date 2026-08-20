import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { POST } from "@/app/api/webhooks/stripe/route";

const { createAdminClientMock, handleStripeEventMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  handleStripeEventMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/billing/webhook-handlers", () => ({ handleStripeEvent: handleStripeEventMock }));

const WEBHOOK_SECRET = "whsec_testsecret";

function fakeAdmin(config: { alreadyProcessed?: boolean; insertError?: unknown } = {}) {
  const insertCalls: Record<string, unknown>[] = [];
  const from = vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: config.alreadyProcessed ? { id: "evt_1" } : null, error: null }),
      }),
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      insertCalls.push(payload);
      return Promise.resolve({ error: config.insertError ?? null });
    }),
  }));
  return { admin: { from }, insertCalls };
}

function signedRequest(payload: string, secret = WEBHOOK_SECRET) {
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": header },
    body: payload,
  });
}

describe("Stripe webhook route", () => {
  const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;
  const payload = JSON.stringify({ id: "evt_1", type: "invoice.paid", data: { object: {} } });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  });
  afterEach(() => {
    if (originalWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
    if (originalSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalSecretKey;
  });

  it("fails closed without webhook configuration", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const response = await POST(signedRequest(payload));
    expect(response.status).toBe(503);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature header at all", async () => {
    const response = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: payload }));
    expect(response.status).toBe(400);
    expect(handleStripeEventMock).not.toHaveBeenCalled();
  });

  it("rejects a payload signed with the wrong secret -- proves real signature verification, not a mocked bypass", async () => {
    const response = await POST(signedRequest(payload, "whsec_wrongsecret"));
    expect(response.status).toBe(400);
    expect(handleStripeEventMock).not.toHaveBeenCalled();
  });

  it("processes a validly-signed new event and marks it processed", async () => {
    const { admin, insertCalls } = fakeAdmin({ alreadyProcessed: false });
    createAdminClientMock.mockReturnValue(admin);
    handleStripeEventMock.mockResolvedValue(undefined);

    const response = await POST(signedRequest(payload));

    expect(response.status).toBe(200);
    expect(handleStripeEventMock).toHaveBeenCalledTimes(1);
    expect(insertCalls).toEqual([{ id: "evt_1", type: "invoice.paid" }]);
  });

  it("is idempotent: a replayed event id skips processing entirely", async () => {
    const { admin, insertCalls } = fakeAdmin({ alreadyProcessed: true });
    createAdminClientMock.mockReturnValue(admin);

    const response = await POST(signedRequest(payload));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ duplicate: true });
    expect(handleStripeEventMock).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
  });

  it("returns 500 and does NOT mark the event processed when handling fails -- so Stripe's retry can reprocess it", async () => {
    const { admin, insertCalls } = fakeAdmin({ alreadyProcessed: false });
    createAdminClientMock.mockReturnValue(admin);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    handleStripeEventMock.mockRejectedValue(new Error("db unavailable"));

    const response = await POST(signedRequest(payload));

    expect(response.status).toBe(500);
    expect(insertCalls).toHaveLength(0);
  });
});
