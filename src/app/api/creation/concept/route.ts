import { NextResponse } from "next/server";
import { z } from "zod";
import { buildCreationConceptPrompt } from "@/lib/creation/concept-prompt";
import { DIALOG_DENSITY_LEVELS } from "@/lib/dialogue-density";
import { estimateWordsForPages } from "@/lib/manuscript/page-estimate";
import { createManagedChatCompletion } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getReasoningModelCandidates } from "@/lib/lmstudio/model-selection";
import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  creationProjectId: z.string().uuid().optional(),
  workingTitle: z.string().trim().min(1).max(180),
  idea: z.string().trim().min(20).max(12000),
  genre: z.string().trim().min(1).max(120),
  targetAudience: z.string().trim().min(1).max(160),
  language: z.string().trim().min(1).max(80),
  targetPages: z.number().int().min(20).max(150),
  tone: z.string().trim().max(500).optional(),
  boundaries: z.string().trim().max(3000).optional(),
  creationMode: z.enum(["single_safe", "dual_role_sequential"]).default("single_safe"),
  dialogDensity: z.enum(DIALOG_DENSITY_LEVELS).default("normal"),
});

function getErrorMessage(error: unknown) {
  const lmStudioMessage = getLmStudioErrorMessage(error, "");
  if (lmStudioMessage) return lmStudioMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Concept pass failed.";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let project: Awaited<ReturnType<typeof upsertCreationProject>> | null = null;

  try {
    const body = schema.parse(await request.json());
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    // Create/update the durable project row BEFORE the LLM call (which can
    // take 30-90s) rather than after it succeeds -- previously, a dropped
    // connection or a slow/failed completion mid-call left no record this
    // generation was ever attempted, since nothing was written until full
    // success. Now a "generating" row always exists first, and the catch
    // block below can mark it "failed" with a reason instead of the
    // attempt just silently vanishing.
    project = await upsertCreationProject(supabase, user.id, body, "generating");

    const estimatedWords = estimateWordsForPages(body.targetPages);
    const expectedChapters = Math.max(6, Math.min(24, Math.round(body.targetPages / 8)));
    const prompt = buildCreationConceptPrompt({
      workingTitle: body.workingTitle,
      idea: body.idea,
      genre: body.genre,
      targetAudience: body.targetAudience,
      language: body.language,
      targetPages: body.targetPages,
      tone: body.tone || "",
      boundaries: body.boundaries || "",
      creationMode: body.creationMode,
      dialogDensity: body.dialogDensity,
      estimatedWords,
      expectedChapters,
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
        temperature: Math.min(settings.temperature, 0.65),
        top_p: settings.topP,
        max_tokens: Math.min(settings.maxOutputTokens, 3500),
        messages: [{ role: "user", content: prompt }],
      },
      undefined,
      telemetryContext,
    );

    const content = parseModelJsonOrFallback(completion.choices[0]?.message.content || "{}", (raw, parseError) => ({
      mainTheme: "",
      readerPromise: "",
      premise: raw,
      emotionalEngine: "",
      genreFit: "",
      targetAudienceFit: "",
      creationThesis: "",
      suggestedStructure: [],
      coreQuestions: [],
      majorRisks: [`The model response needed fallback parsing: ${parseError}`],
      differentiators: [],
      recommendedNextQuestionsForAuthor: [],
      modelStrategyRecommendation: {
        mode: body.creationMode,
        reason: "Fallback concept created from raw model response.",
      },
    })) as Record<string, unknown>;
    content.lmStudioRuntimeLimits = preparedModel.runtimeLimits;
    content.lmStudioWarnings = preparedModel.warnings;
    content.modelSelection = modelSelection;

    const { data: finalizedProject, error: finalizeError } = await supabase
      .from("creation_projects")
      .update({ status: "concept", updated_at: new Date().toISOString() })
      .eq("id", project.id)
      .select("*")
      .single();
    if (finalizeError) throw finalizeError;
    project = finalizedProject;

    const { data: version, error: versionError } = await supabase
      .from("creation_plan_versions")
      .insert({
        creation_project_id: project.id,
        version_type: "concept",
        content,
        prompt_snapshot: prompt,
      })
      .select("id,created_at")
      .single();
    if (versionError) throw versionError;

    return NextResponse.json({
      content: {
        creationProject: project,
        conceptVersion: version,
        concept: content,
      },
    });
  } catch (error) {
    if (project) {
      await supabase
        .from("creation_projects")
        .update({
          status: "failed",
          metadata: { ...((project as { metadata?: Record<string, unknown> }).metadata || {}), lastError: getErrorMessage(error) },
          updated_at: new Date().toISOString(),
        })
        .eq("id", project.id);
    }
    console.error("Creation concept failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function upsertCreationProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: z.infer<typeof schema>,
  status: "generating" | "concept" = "concept",
) {
  const payload = {
    owner_id: userId,
    working_title: body.workingTitle,
    idea_prompt: body.idea,
    genre: body.genre,
    target_audience: body.targetAudience,
    language: body.language,
    target_pages: body.targetPages,
    tone: body.tone || null,
    boundaries: body.boundaries || null,
    creation_mode: body.creationMode,
    dialog_density: body.dialogDensity,
    status,
    updated_at: new Date().toISOString(),
  };

  if (body.creationProjectId) {
    const { data, error } = await supabase
      .from("creation_projects")
      .update(payload)
      .eq("id", body.creationProjectId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("creation_projects")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
