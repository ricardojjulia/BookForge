import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { handleStripeEvent, UnprocessableStripeEventError } from "@/lib/billing/webhook-handlers";

type AdminSupabase = Parameters<typeof handleStripeEvent>[0];

function fakeAdmin(config: {
  tierByPrice?: Record<string, { id: string } | undefined>;
  subscriptionByStripeId?: Record<string, { user_id: string } | undefined>;
  upsertError?: unknown;
  updateError?: unknown;
  rpcError?: unknown;
}) {
  const upsertCalls: Record<string, unknown>[] = [];
  const updateCalls: { payload: Record<string, unknown>; eqCol: string; eqVal: string }[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

  const from = vi.fn((table: string) => {
    if (table === "subscription_tiers") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn((_col: string, val: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: config.tierByPrice?.[val] ?? null, error: null }),
          })),
        }),
      };
    }
    if (table === "user_subscriptions") {
      return {
        upsert: vi.fn((payload: Record<string, unknown>) => {
          upsertCalls.push(payload);
          return Promise.resolve({ error: config.upsertError ?? null });
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn((_col: string, val: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: config.subscriptionByStripeId?.[val] ?? null, error: null }),
          })),
        }),
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn((col: string, val: string) => {
            updateCalls.push({ payload, eqCol: col, eqVal: val });
            return Promise.resolve({ error: config.updateError ?? null });
          }),
        })),
      };
    }
    throw new Error(`fakeAdmin: unexpected table "${table}"`);
  });

  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve({ error: config.rpcError ?? null });
  });

  return { admin: { from, rpc } as unknown as AdminSupabase, upsertCalls, updateCalls, rpcCalls };
}

function fakeSubscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    metadata: { supabase_user_id: "user-1" },
    items: { data: [{ price: { id: "price_pro" }, current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function fakeInvoice(overrides: Record<string, unknown> = {}): Stripe.Invoice {
  return {
    id: "in_123",
    lines: { data: [{ subscription: "sub_123", period: { start: 1_700_000_000, end: 1_702_592_000 } }] },
    ...overrides,
  } as unknown as Stripe.Invoice;
}

function eventOf(type: string, object: unknown): Stripe.Event {
  return { id: "evt_1", type, data: { object } } as unknown as Stripe.Event;
}

describe("handleStripeEvent: customer.subscription.created", () => {
  it("resolves the tier, upserts the subscription, and grants credits", async () => {
    const { admin, upsertCalls, rpcCalls } = fakeAdmin({ tierByPrice: { price_pro: { id: "pro" } } });

    await handleStripeEvent(admin, eventOf("customer.subscription.created", fakeSubscription()));

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toMatchObject({
      user_id: "user-1",
      tier_id: "pro",
      status: "active",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
    });
    expect(rpcCalls).toEqual([{ fn: "grant_tier_credits", args: { p_user_id: "user-1", p_kind: "grant" } }]);
  });

  it("is a no-op when the subscription carries no supabase_user_id metadata", async () => {
    const { admin, upsertCalls, rpcCalls } = fakeAdmin({ tierByPrice: { price_pro: { id: "pro" } } });

    await handleStripeEvent(admin, eventOf("customer.subscription.created", fakeSubscription({ metadata: {} })));

    expect(upsertCalls).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });

  it("fails closed (throws, writes nothing) on an unrecognized price id", async () => {
    const { admin, upsertCalls, rpcCalls } = fakeAdmin({ tierByPrice: {} });

    await expect(
      handleStripeEvent(admin, eventOf("customer.subscription.created", fakeSubscription())),
    ).rejects.toThrow(UnprocessableStripeEventError);
    expect(upsertCalls).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("handleStripeEvent: invoice.paid", () => {
  it("updates the period and resets credits for the matched user", async () => {
    const { admin, updateCalls, rpcCalls } = fakeAdmin({ subscriptionByStripeId: { sub_123: { user_id: "user-1" } } });

    await handleStripeEvent(admin, eventOf("invoice.paid", fakeInvoice()));

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].eqCol).toBe("user_id");
    expect(updateCalls[0].eqVal).toBe("user-1");
    expect(rpcCalls).toEqual([{ fn: "grant_tier_credits", args: { p_user_id: "user-1", p_kind: "period_reset" } }]);
  });

  it("is a no-op when no local subscription row matches yet", async () => {
    const { admin, updateCalls, rpcCalls } = fakeAdmin({ subscriptionByStripeId: {} });

    await handleStripeEvent(admin, eventOf("invoice.paid", fakeInvoice()));

    expect(updateCalls).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("handleStripeEvent: invoice.payment_failed", () => {
  it("sets status to past_due, keyed on stripe_subscription_id", async () => {
    const { admin, updateCalls } = fakeAdmin({});

    await handleStripeEvent(admin, eventOf("invoice.payment_failed", fakeInvoice()));

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ payload: { status: "past_due" }, eqCol: "stripe_subscription_id", eqVal: "sub_123" });
  });
});

describe("handleStripeEvent: customer.subscription.updated", () => {
  it("re-syncs tier, status, and period from the new price", async () => {
    const { admin, updateCalls } = fakeAdmin({ tierByPrice: { price_studio: { id: "studio" } } });

    await handleStripeEvent(
      admin,
      eventOf("customer.subscription.updated", fakeSubscription({ items: { data: [{ price: { id: "price_studio" }, current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 }] } })),
    );

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ payload: { tier_id: "studio", status: "active" }, eqCol: "stripe_subscription_id", eqVal: "sub_123" });
  });
});

describe("handleStripeEvent: customer.subscription.deleted", () => {
  it("sets status to canceled without touching tier_id", async () => {
    const { admin, updateCalls } = fakeAdmin({});

    await handleStripeEvent(admin, eventOf("customer.subscription.deleted", fakeSubscription()));

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toEqual({ status: "canceled", updated_at: expect.any(String) });
    expect(updateCalls[0].eqCol).toBe("stripe_subscription_id");
  });
});

describe("handleStripeEvent: unrecognized event types", () => {
  it("is a no-op, never throws", async () => {
    const { admin } = fakeAdmin({});
    await expect(handleStripeEvent(admin, eventOf("payment_intent.succeeded", {}))).resolves.toBeUndefined();
  });
});
