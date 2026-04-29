import OpenAI from "openai";
import type { LmStudioSettings } from "@/lib/types";

export const DEFAULT_LMSTUDIO_BASE_URL = "http://localhost:1234/v1";

export function createLmStudioClient(settings?: Partial<LmStudioSettings>) {
  return new OpenAI({
    baseURL: settings?.baseUrl || process.env.LMSTUDIO_BASE_URL || DEFAULT_LMSTUDIO_BASE_URL,
    apiKey: settings?.apiKey || process.env.LMSTUDIO_API_KEY || "lm-studio",
  });
}

export async function testLmStudioConnection(settings?: Partial<LmStudioSettings>) {
  const client = createLmStudioClient(settings);
  const models = await client.models.list();
  return {
    ok: true,
    models: models.data.map((model) => model.id),
  };
}
