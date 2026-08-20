import { describe, expect, it } from "vitest";
import { computeCostUsdMicros, getCurrentModelPricing } from "@/lib/subscription/pricing";

describe("computeCostUsdMicros", () => {
  it("computes cost from real token usage against a pricing row", () => {
    // DeepSeek V4 Pro live rate: $0.507/M in, $1.014/M out.
    const pricing = { inputUsdMicrosPerMillionTokens: 507_000, outputUsdMicrosPerMillionTokens: 1_014_000 };
    // 1.3M input, 92K output -- the rewrite-pass token range from this session's cost analysis.
    const cost = computeCostUsdMicros(1_300_000, 92_000, pricing);
    // 1.3 * 507000 + 0.092 * 1014000 = 659100 + 93288 = 752388 micros (~$0.75)
    expect(cost).toBe(752388);
  });

  it("returns 0 for zero token usage", () => {
    const pricing = { inputUsdMicrosPerMillionTokens: 507_000, outputUsdMicrosPerMillionTokens: 1_014_000 };
    expect(computeCostUsdMicros(0, 0, pricing)).toBe(0);
  });
});

describe("getCurrentModelPricing", () => {
  it("returns null (not throw) when the model has no pricing row", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getCurrentModelPricing>[0];

    await expect(getCurrentModelPricing(supabase, "unknown/model")).resolves.toBeNull();
  });

  it("returns null (not throw) on a query error", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: new Error("connection reset") }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getCurrentModelPricing>[0];

    await expect(getCurrentModelPricing(supabase, "deepseek/deepseek-v4-pro")).resolves.toBeNull();
  });

  it("maps the current pricing row", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { input_usd_micros_per_million_tokens: 507_000, output_usd_micros_per_million_tokens: 1_014_000 },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getCurrentModelPricing>[0];

    await expect(getCurrentModelPricing(supabase, "deepseek/deepseek-v4-pro")).resolves.toEqual({
      inputUsdMicrosPerMillionTokens: 507_000,
      outputUsdMicrosPerMillionTokens: 1_014_000,
    });
  });
});
