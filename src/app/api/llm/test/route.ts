import { NextResponse } from "next/server";
import { createProviderClient, PROVIDER_META } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";
import type { LlmProvider, StandardLlmSettings } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const body = (await request.json()) as {
      provider?: string;
      apiKey?: string;
      model?: string;
      baseUrl?: string;
    };

    const provider = (body.provider || "openai") as LlmProvider;
    const meta = PROVIDER_META.find((p) => p.id === provider);

    const settings: StandardLlmSettings = {
      provider,
      apiKey: body.apiKey,
      model: body.model || meta?.defaultModels[0],
      baseUrl: body.baseUrl || undefined,
    };

    const client = createProviderClient(settings);
    const models = await client.models.list();
    const modelIds = models.data.map((m) => m.id).slice(0, 5);

    return NextResponse.json({
      ok: true,
      message: `Connected to ${meta?.label ?? provider}. Models: ${modelIds.join(", ") || "none listed"}.`,
      models: modelIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
