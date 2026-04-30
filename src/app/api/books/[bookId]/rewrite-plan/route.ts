import { NextResponse } from "next/server";
import { estimateAiCallPlan } from "@/lib/ai/call-planner";
import { selectBestRewriteModel } from "@/lib/ai/rewrite-model-suitability";
import { createLmStudioClient, testLmStudioConnection } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getReasoningModelCandidates, selectLoadedLmStudioModel } from "@/lib/lmstudio/model-selection";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { applyRewritePlanDefaults } from "@/lib/rewrite/plan-defaults";
import { buildRewritePlanPrompt } from "@/lib/rewrite/plan-prompt";
import { createClient } from "@/lib/supabase/server";

function getErrorMessage(error: unknown) {
  const lmStudioMessage = getLmStudioErrorMessage(error, "");
  if (lmStudioMessage) return lmStudioMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Rewrite plan generation failed.";
}

export async function POST(_: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const [
      { data: book, error: bookError },
      { data: bible },
      { data: chapters, error: chaptersError },
      { data: reports, error: reportsError },
      { count: scenes },
      { count: paragraphs },
    ] = await Promise.all([
      supabase.from("books").select("title,genre,target_audience").eq("id", bookId).single(),
      supabase.from("book_bibles").select("content").eq("book_id", bookId).maybeSingle(),
      supabase
        .from("chapters")
        .select("chapter_number,title,summary")
        .eq("book_id", bookId)
        .order("chapter_number"),
      supabase
        .from("coherence_reports")
        .select("report_type,created_at,content")
        .eq("book_id", bookId)
        .like("report_type", "critic:%")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("scenes").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId),
    ]);

    if (bookError) throw bookError;
    if (chaptersError) throw chaptersError;
    if (reportsError) throw reportsError;

    const settings = await getUserLmStudioSettings(user.id);
    const client = createLmStudioClient(settings);
    let availableModels: string[] = [];
    try {
      availableModels = (await testLmStudioConnection({ baseUrl: settings.baseUrl })).models;
    } catch {
      availableModels = [];
    }
    const modelSelection = selectLoadedLmStudioModel({
      candidates: getReasoningModelCandidates(settings),
      availableModels,
    });
    const model = modelSelection.model;
    const rewriteModelSelection = selectBestRewriteModel(availableModels, {
      qualityProfile: settings.qualityProfile,
      contextWindowTokens: settings.contextWindowTokens,
    });
    const plan = estimateAiCallPlan({
      task: "critic",
      selectedModel: model,
      qualityProfile: settings.qualityProfile,
      contextWindowTokens: settings.contextWindowTokens,
      maxOutputTokens: settings.maxOutputTokens,
      chapterCount: chapters?.length || 0,
      sceneCount: scenes || 0,
      paragraphCount: paragraphs || 0,
    });

    const prompt = buildRewritePlanPrompt({
      title: book.title,
      genre: book.genre,
      targetAudience: book.target_audience,
      manuscriptBlueprint: bible?.content,
      rewriteModelSelection,
      chapters: chapters || [],
      criticReports: reports || [],
    });

    const completion = await client.chat.completions.create({
      model,
      temperature: Math.min(settings.temperature, 0.35),
      top_p: settings.topP,
      max_tokens: settings.maxOutputTokens,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "text" },
    });

    const parsed = parseModelJsonOrFallback(completion.choices[0]?.message.content || "{}", (raw, parseError) => ({
      rewriteObjective: raw,
      globalGuardrails: [],
      coherenceContract: {},
      executionStrategy: {},
      phases: [],
      chapterRewriteDirectives: [],
      postRewriteCriticPasses: [],
      acceptanceCriteria: [],
      parseWarning: parseError,
    }));
    const content = applyRewritePlanDefaults(
      {
        ...(typeof parsed === "object" && parsed ? parsed : { rewriteObjective: String(parsed) }),
        aiCallPlan: {
          ...plan,
          expectedCalls: 1,
          actualCalls: 1,
          unitStrategy: "summaries",
        },
        sourceCriticReports: reports?.length || 0,
        rewriteModelSelection,
        plannerModelSelection: modelSelection,
        generatedAt: new Date().toISOString(),
      },
      { chapters: chapters || [] },
    );

    const { error: insertError } = await supabase.from("coherence_reports").insert({
      book_id: bookId,
      report_type: "rewrite_plan",
      content,
    });
    if (insertError) throw insertError;

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Rewrite plan generation failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
