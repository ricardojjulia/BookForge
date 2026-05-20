import { NextResponse } from "next/server";
import { getConfiguredTaskModels, isModelAvailable } from "@/lib/ai/model-status";
import { selectBestRewriteModel } from "@/lib/ai/rewrite-model-suitability";
import { testLmStudioConnection } from "@/lib/lmstudio/client";
import { getLmStudioRuntimeLimits } from "@/lib/lmstudio/runtime-limits";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const settings = await getUserLmStudioSettings(user.id);
    let connected = false;
    let availableModels: string[] = [];
    let error: string | null = null;

    try {
      const result = await testLmStudioConnection({ baseUrl: settings.baseUrl });
      connected = result.ok;
      availableModels = result.models;
    } catch (err) {
      error = err instanceof Error ? err.message : "Unable to reach LM Studio.";
    }

    const configuredModels = getConfiguredTaskModels(settings).map((item) => ({
      ...item,
      available: isModelAvailable(item.model, availableModels),
    }));
    const rewriteModelSuitability = selectBestRewriteModel(availableModels, {
      qualityProfile: settings.qualityProfile,
      contextWindowTokens: settings.contextWindowTokens,
    });
    const runtimeLimits = {
      planning: getLmStudioRuntimeLimits(settings, "planning"),
      rewrite: getLmStudioRuntimeLimits(settings, "rewrite"),
      critic: getLmStudioRuntimeLimits(settings, "critic"),
      extraction: getLmStudioRuntimeLimits(settings, "extraction"),
    };
    const configuredRewriteModelSuitability =
      rewriteModelSuitability.candidates.find((candidate) => candidate.model === settings.primaryRewriteModel) || null;
    const configuredRewriteModel = {
      model: settings.primaryRewriteModel || "",
      available: isModelAvailable(settings.primaryRewriteModel, availableModels),
      suitability: configuredRewriteModelSuitability,
    };
    const warnings = [
      ...configuredModels
        .filter((item) => item.model && !item.available)
        .map((item) => `${item.label} model is configured but unavailable in LM Studio: ${item.model}`),
      ...(rewriteModelSuitability.warning ? [rewriteModelSuitability.warning] : []),
      ...runtimeLimits.planning.warnings,
    ];

    return NextResponse.json({
      connected,
      baseUrl: settings.baseUrl,
      qualityProfile: settings.qualityProfile,
      contextWindowTokens: settings.contextWindowTokens,
      temperature: settings.temperature,
      topP: settings.topP,
      repeatPenalty: settings.repeatPenalty,
      maxOutputTokens: settings.maxOutputTokens,
      runtimeLimits,
      availableModels,
      configuredModels,
      rewriteModelSuitability,
      configuredRewriteModel,
      configuredRewriteModelSuitability,
      warnings,
      error,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load model status." },
      { status: 500 },
    );
  }
}
