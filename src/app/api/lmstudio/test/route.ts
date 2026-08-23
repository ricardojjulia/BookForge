import { NextResponse } from "next/server";
import { z } from "zod";
import { testLmStudioConnection } from "@/lib/lmstudio/client";
import { assertNotOpenRouterManagementKey, PROVIDER_META, providerChatCompletion } from "@/lib/ai/providers";
import { assertModelAllowedForUser, reconcileCreditReservation, reserveCreditsForCall } from "@/lib/subscription/enforcement";
import { computeCostUsdMicros, getCurrentModelPricing } from "@/lib/subscription/pricing";
import { createClient } from "@/lib/supabase/server";
import type { LlmProvider } from "@/lib/types";

const schema = z.object({
  baseUrl: z.string().url().optional(),
  provider: z.enum(["openai", "anthropic", "google", "openrouter"]).optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

    const body = schema.parse(await request.json());

    if (body.provider) {
      const meta = PROVIDER_META.find((p) => p.id === body.provider);
      const model = body.model || meta?.defaultModels[0] || "gpt-4o";

      if (body.provider === "openrouter" && body.apiKey) {
        await assertNotOpenRouterManagementKey(body.apiKey);
      }

      // A caller-supplied apiKey means this ping is billed to the caller's
      // own account, not BookForge's -- no tier gate/credit reservation
      // needed. Without one, createProviderClient silently falls back to
      // this server's own provider API key (see src/lib/ai/providers.ts),
      // so an omitted key must be gated exactly like a real managed-SaaS call.
      let reservation: { reservationId: string } | null = null;
      const maxTokens = 1;
      if (!body.apiKey) {
        await assertModelAllowedForUser(supabase, { userId: user.id, model, task: "connection_test" });
        reservation = await reserveCreditsForCall(supabase, {
          userId: user.id,
          model,
          task: "connection_test",
          promptTokensEstimate: 2,
          maxOutputTokens: maxTokens,
        });
      }

      // Cloud provider check: a minimal chat completion is the one call shape
      // every provider here supports identically (unlike /models, which some
      // OpenAI-compatible endpoints don't implement).
      const completion = await providerChatCompletion(
        { provider: body.provider as LlmProvider, apiKey: body.apiKey, model: body.model },
        { messages: [{ role: "user", content: "ping" }], max_tokens: maxTokens },
      );

      if (reservation) {
        const promptTokens = completion.usage?.prompt_tokens ?? null;
        const completionTokens = completion.usage?.completion_tokens ?? null;
        const pricing = promptTokens !== null && completionTokens !== null ? await getCurrentModelPricing(supabase, model) : null;
        if (pricing && promptTokens !== null && completionTokens !== null) {
          await reconcileCreditReservation(supabase, {
            reservationId: reservation.reservationId,
            actualCostUsdMicros: computeCostUsdMicros(promptTokens, completionTokens, pricing),
          });
        }
      }

      return NextResponse.json({ ok: true });
    }

    const result = await testLmStudioConnection({ baseUrl: body.baseUrl });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Connection failed." },
      { status: 500 },
    );
  }
}
