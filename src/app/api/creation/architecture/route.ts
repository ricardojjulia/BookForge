import { NextResponse } from "next/server";
import { z } from "zod";
import { buildCreationArchitecturePrompt } from "@/lib/creation/architecture-prompt";
import { createManagedChatCompletion } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getReasoningModelCandidates } from "@/lib/lmstudio/model-selection";
import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  creationProjectId: z.string().uuid(),
  concept: z.record(z.string(), z.unknown()),
});

function getErrorMessage(error: unknown) {
  const lmStudioMessage = getLmStudioErrorMessage(error, "");
  if (lmStudioMessage) return lmStudioMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Architecture generation failed.";
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: project, error: projectError } = await supabase
      .from("creation_projects")
      .select("*")
      .eq("id", body.creationProjectId)
      .eq("owner_id", user.id)
      .single();
    if (projectError) throw projectError;

    await supabase
      .from("creation_plan_versions")
      .update({ accepted: false })
      .eq("creation_project_id", project.id)
      .eq("version_type", "concept");

    const { data: acceptedConcept, error: conceptError } = await supabase
      .from("creation_plan_versions")
      .insert({
        creation_project_id: project.id,
        version_type: "concept",
        content: body.concept,
        accepted: true,
      })
      .select("id,created_at")
      .single();
    if (conceptError) throw conceptError;

    const targetPages = Number(project.target_pages || 120);
    const estimatedWords = Math.round(targetPages * 275);
    const expectedChapters = Math.max(6, Math.min(24, Math.round(targetPages / 8)));
    const prompt = buildCreationArchitecturePrompt({
      workingTitle: project.working_title,
      genre: project.genre || "Unspecified",
      targetAudience: project.target_audience || "Unspecified",
      language: project.language || "English",
      targetPages,
      estimatedWords,
      expectedChapters,
      tone: project.tone || "",
      boundaries: project.boundaries || "",
      dialogDensity: project.dialog_density || "normal",
      concept: body.concept,
    });

    const settings = await getUserLmStudioSettings(user.id);
    const modelPlan = await selectAndPrepareActiveModel(settings, {
      task: "planning",
      candidates: getReasoningModelCandidates(settings),
      expectedCalls: 1,
      latencyPreference: "quality",
      telemetry: { supabase, userId: user.id },
    });
    const { client, preparedModel, modelSelection, telemetryContext } = modelPlan;
    const completion = await createManagedChatCompletion(
      client,
      preparedModel,
      {
        temperature: Math.min(settings.temperature, 0.55),
        top_p: settings.topP,
        max_tokens: Math.min(settings.maxOutputTokens, 5000),
        messages: [{ role: "user", content: prompt }],
      },
      undefined,
      telemetryContext,
    );

    const architecture = parseModelJsonOrFallback(completion.choices[0]?.message.content || "{}", (raw, parseError) => ({
      architectureSummary: raw,
      parts: [],
      globalContinuityRules: [],
      voiceRules: [],
      motifsToDevelop: [],
      generationWarnings: [`The model response needed fallback parsing: ${parseError}`],
    })) as Record<string, unknown>;
    architecture.lmStudioRuntimeLimits = preparedModel.runtimeLimits;
    architecture.lmStudioWarnings = preparedModel.warnings;
    architecture.modelSelection = modelSelection;

    const { data: version, error: versionError } = await supabase
      .from("creation_plan_versions")
      .insert({
        creation_project_id: project.id,
        version_type: "architecture",
        content: architecture,
        prompt_snapshot: prompt,
      })
      .select("id,created_at")
      .single();
    if (versionError) throw versionError;

    const { error: updateError } = await supabase
      .from("creation_projects")
      .update({ status: "planning", updated_at: new Date().toISOString() })
      .eq("id", project.id);
    if (updateError) throw updateError;

    return NextResponse.json({
      content: {
        acceptedConcept,
        architectureVersion: version,
        architecture,
      },
    });
  } catch (error) {
    console.error("Creation architecture failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
