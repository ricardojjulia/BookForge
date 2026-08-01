import { NextResponse } from "next/server";
import { z } from "zod";
import { testLmStudioConnection } from "@/lib/lmstudio/client";
import { providerChatCompletion } from "@/lib/ai/providers";
import type { LlmProvider } from "@/lib/types";

const schema = z.object({
  baseUrl: z.string().url().optional(),
  provider: z.enum(["openai", "anthropic", "google", "openrouter"]).optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    if (body.provider) {
      // Cloud provider check: a minimal chat completion is the one call shape
      // every provider here supports identically (unlike /models, which some
      // OpenAI-compatible endpoints don't implement).
      await providerChatCompletion(
        { provider: body.provider as LlmProvider, apiKey: body.apiKey, model: body.model },
        { messages: [{ role: "user", content: "ping" }], max_tokens: 1 },
      );
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
