import { NextResponse } from "next/server";
import { z } from "zod";
import { buildCreationArchitecturePrompt } from "@/lib/creation/architecture-prompt";
import { createManagedChatCompletion } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getReasoningModelCandidates } from "@/lib/lmstudio/model-selection";
import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { estimateWordsForPages } from "@/lib/manuscript/page-estimate";
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
    const estimatedWords = estimateWordsForPages(targetPages);
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
    // The previous flat 5000-token cap (itself often further clamped to the
    // LOCAL LM Studio max_output_tokens default of 4096, even when a cloud
    // model with much larger real capacity was doing the work) silently
    // truncated anything past ~6-7 chapters: jsonrepair "recovers" from the
    // resulting cut-off JSON by closing unclosed brackets, which produces a
    // *valid* but silently incomplete architecture — fewer parts and
    // chapters than requested, with no error and no visible warning.
    // A first attempt at estimating ~550 tokens/chapter was still too low —
    // measured real usage came in closer to ~2000 tokens/chapter once a
    // model writes full keyBeats/continuityNotes/riskNotes arrays. This is a
    // single one-time planning call per book, not a high-volume one, so the
    // fix is to just be generous rather than keep fine-tuning a formula:
    // give cloud providers (which comfortably support tens of thousands of
    // output tokens) a large flat ceiling instead of estimating tightly.
    const architectureMaxTokens = preparedModel.isCloud ? 32000 : settings.maxOutputTokens;
    const completion = await createManagedChatCompletion(
      client,
      preparedModel,
      {
        temperature: Math.min(settings.temperature, 0.55),
        top_p: settings.topP,
        max_tokens: architectureMaxTokens,
        messages: [{ role: "user", content: prompt }],
      },
      undefined,
      telemetryContext,
    );
    const truncated = completion.choices[0]?.finish_reason === "length";

    const architecture = parseModelJsonOrFallback(completion.choices[0]?.message.content || "{}", (raw, parseError) => ({
      architectureSummary: raw,
      parts: [],
      globalContinuityRules: [],
      voiceRules: [],
      motifsToDevelop: [],
      generationWarnings: [`The model response needed fallback parsing: ${parseError}`],
    })) as Record<string, unknown>;
    if (truncated) {
      const existingWarnings = Array.isArray(architecture.generationWarnings) ? architecture.generationWarnings : [];
      architecture.generationWarnings = [
        `The model's response was cut off at the ${architectureMaxTokens}-token output limit before it finished — the structure below is likely missing parts or chapters it intended to include (the JSON was auto-repaired to stay valid, which hides the cut rather than erroring). Click Regenerate Architecture, or reduce target pages, before accepting.`,
        ...existingWarnings,
      ];
    }
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
