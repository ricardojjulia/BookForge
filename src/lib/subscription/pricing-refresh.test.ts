import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshModelPricingFromOpenRouter } from "@/lib/subscription/pricing-refresh";

type PricingRow = { model: string; input_usd_micros_per_million_tokens: number; output_usd_micros_per_million_tokens: number };

function fakeAdminSupabase(input: { currentRows: PricingRow[]; selectError?: unknown; closeError?: unknown; insertError?: unknown }) {
  const updateCalls: { model: string; payload: unknown }[] = [];
  const insertCalls: { payload: Record<string, unknown> }[] = [];

  const from = vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      is: vi.fn().mockResolvedValue({ data: input.currentRows, error: input.selectError ?? null }),
    }),
    update: vi.fn((payload: unknown) => ({
      eq: vi.fn((_col: string, model: string) => ({
        is: vi.fn(() => {
          updateCalls.push({ model, payload });
          return Promise.resolve({ error: input.closeError ?? null });
        }),
      })),
    })),
    insert: vi.fn((payload: Record<string, unknown>) => {
      insertCalls.push({ payload });
      return Promise.resolve({ error: input.insertError ?? null });
    }),
  }));

  return { supabase: { from } as unknown as Parameters<typeof refreshModelPricingFromOpenRouter>[0], updateCalls, insertCalls };
}

function mockOpenRouterResponse(models: { id: string; pricing: { prompt: string; completion: string } }[]) {
  return { ok: true, json: () => Promise.resolve({ data: models }) } as Response;
}

describe("refreshModelPricingFromOpenRouter", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("does nothing when there are no current pricing rows to compare against", async () => {
    const { supabase } = fakeAdminSupabase({ currentRows: [] });
    await expect(refreshModelPricingFromOpenRouter(supabase)).resolves.toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("versions in a new row when a tracked model's price genuinely moved", async () => {
    const { supabase, updateCalls, insertCalls } = fakeAdminSupabase({
      currentRows: [{ model: "deepseek/deepseek-v4-pro", input_usd_micros_per_million_tokens: 507_000, output_usd_micros_per_million_tokens: 1_014_000 }],
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockOpenRouterResponse([{ id: "deepseek/deepseek-v4-pro", pricing: { prompt: "0.0000016", completion: "0.0000032" } }]),
    );

    const changes = await refreshModelPricingFromOpenRouter(supabase);

    expect(changes).toEqual([
      {
        model: "deepseek/deepseek-v4-pro",
        oldInputUsdMicrosPerMillionTokens: 507_000,
        newInputUsdMicrosPerMillionTokens: 1_600_000,
        oldOutputUsdMicrosPerMillionTokens: 1_014_000,
        newOutputUsdMicrosPerMillionTokens: 3_200_000,
      },
    ]);
    expect(updateCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].payload).toMatchObject({
      model: "deepseek/deepseek-v4-pro",
      input_usd_micros_per_million_tokens: 1_600_000,
      output_usd_micros_per_million_tokens: 3_200_000,
    });
  });

  it("leaves pricing untouched when the live rate is within the noise epsilon", async () => {
    const { supabase, updateCalls, insertCalls } = fakeAdminSupabase({
      currentRows: [{ model: "google/gemini-2.5-flash", input_usd_micros_per_million_tokens: 300_000, output_usd_micros_per_million_tokens: 2_500_000 }],
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockOpenRouterResponse([{ id: "google/gemini-2.5-flash", pricing: { prompt: "0.0000003", completion: "0.0000025" } }]),
    );

    await expect(refreshModelPricingFromOpenRouter(supabase)).resolves.toEqual([]);
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("skips a model missing from the live OpenRouter response instead of crashing", async () => {
    const { supabase, updateCalls } = fakeAdminSupabase({
      currentRows: [{ model: "anthropic/claude-opus-5", input_usd_micros_per_million_tokens: 5_000_000, output_usd_micros_per_million_tokens: 25_000_000 }],
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpenRouterResponse([]));

    await expect(refreshModelPricingFromOpenRouter(supabase)).resolves.toEqual([]);
    expect(updateCalls).toHaveLength(0);
  });

  it("fails open (returns no changes, never throws) when the OpenRouter fetch itself fails", async () => {
    const { supabase } = fakeAdminSupabase({
      currentRows: [{ model: "deepseek/deepseek-v4-pro", input_usd_micros_per_million_tokens: 507_000, output_usd_micros_per_million_tokens: 1_014_000 }],
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    await expect(refreshModelPricingFromOpenRouter(supabase)).resolves.toEqual([]);
  });

  it("fails open when the current-pricing query itself errors", async () => {
    const { supabase } = fakeAdminSupabase({ currentRows: [], selectError: new Error("db down") });
    await expect(refreshModelPricingFromOpenRouter(supabase)).resolves.toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
