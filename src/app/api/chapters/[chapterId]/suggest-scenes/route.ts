import { NextResponse } from "next/server";
import { buildSceneSplitPrompt } from "@/lib/structure/scene-split-prompt";
import { createManagedChatCompletion } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getReasoningModelCandidates } from "@/lib/lmstudio/model-selection";
import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { createClient } from "@/lib/supabase/server";

const TARGET_WORDS_PER_SCENE = 2000;

type ChapterRow = {
  id: string;
  book_id: string;
  chapter_number: number;
  title: string | null;
};

type ParagraphRow = {
  id: string;
  paragraph_number: number;
  original_text: string;
};

type Suggestion = {
  startParagraphNumber?: number;
  title?: string;
  rationale?: string;
};

function getErrorMessage(error: unknown) {
  const lmStudioMessage = getLmStudioErrorMessage(error, "");
  if (lmStudioMessage) return lmStudioMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return "Unable to suggest scenes.";
}

export async function POST(_: Request, context: { params: Promise<{ chapterId: string }> }) {
  try {
    const { chapterId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: chapter, error: chapterError } = await supabase
      .from("chapters")
      .select("id,book_id,chapter_number,title")
      .eq("id", chapterId)
      .single();
    if (chapterError) throw chapterError;
    const chapterRow = chapter as ChapterRow;

    const { data: paragraphs, error: paragraphsError } = await supabase
      .from("paragraphs")
      .select("id,paragraph_number,original_text")
      .eq("chapter_id", chapterId)
      .order("paragraph_number");
    if (paragraphsError) throw paragraphsError;
    const paragraphRows = (paragraphs || []) as ParagraphRow[];

    if (paragraphRows.length < 2) {
      return NextResponse.json({ error: "This chapter doesn't have enough paragraphs to split into scenes." }, { status: 400 });
    }

    // Clear this chapter's pending suggestions before generating new ones,
    // so the review list never shows stale duplicates from an earlier run.
    // Already-approved/rejected suggestions are left alone -- they're history.
    const { error: clearError } = await supabase
      .from("scene_split_suggestions")
      .delete()
      .eq("chapter_id", chapterId)
      .eq("status", "pending");
    if (clearError) throw clearError;

    const settings = await getUserLmStudioSettings(user.id);
    const modelPlan = await selectAndPrepareActiveModel(settings, {
      task: "planning",
      candidates: getReasoningModelCandidates(settings),
      expectedCalls: 1,
      latencyPreference: "quality",
      telemetry: { supabase, userId: user.id },
    });
    const { client, preparedModel, telemetryContext } = modelPlan;

    const completion = await createManagedChatCompletion(
      client,
      preparedModel,
      {
        temperature: Math.min(settings.temperature, 0.35),
        top_p: settings.topP,
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: buildSceneSplitPrompt({
              chapterTitle: chapterRow.title || `Chapter ${chapterRow.chapter_number}`,
              chapterNumber: chapterRow.chapter_number,
              targetWordsPerScene: TARGET_WORDS_PER_SCENE,
              promptCharBudget: preparedModel.runtimeLimits.promptCharBudget,
              paragraphs: paragraphRows.map((paragraph) => ({
                paragraphNumber: paragraph.paragraph_number,
                text: paragraph.original_text,
              })),
            }),
          },
        ],
      },
      undefined,
      telemetryContext,
    );

    const parsed = parseModelJsonOrFallback(completion.choices[0]?.message.content || "{}", (raw, parseError) => ({
      suggestions: [],
      parseWarning: parseError,
      rawModelResponse: raw,
    })) as { suggestions?: Suggestion[] };

    const paragraphByNumber = new Map(paragraphRows.map((paragraph) => [paragraph.paragraph_number, paragraph]));
    const maxParagraphNumber = paragraphRows[paragraphRows.length - 1].paragraph_number;
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

    const rows = suggestions
      .filter((suggestion): suggestion is Required<Pick<Suggestion, "startParagraphNumber">> & Suggestion => {
        const paragraphNumber = Number(suggestion.startParagraphNumber);
        return (
          Number.isFinite(paragraphNumber) &&
          paragraphNumber > paragraphRows[0].paragraph_number &&
          paragraphNumber <= maxParagraphNumber &&
          paragraphByNumber.has(paragraphNumber)
        );
      })
      .slice(0, 20)
      .map((suggestion) => {
        const paragraph = paragraphByNumber.get(Number(suggestion.startParagraphNumber))!;
        return {
          book_id: chapterRow.book_id,
          chapter_id: chapterId,
          start_paragraph_id: paragraph.id,
          title: stringValue(suggestion.title) || `Scene at paragraph ${paragraph.paragraph_number}`,
          rationale: stringValue(suggestion.rationale) || null,
          estimated_word_count: 0,
          status: "pending",
        };
      });

    if (rows.length) {
      const { error: insertError } = await supabase.from("scene_split_suggestions").insert(rows);
      if (insertError) throw insertError;
    }

    return NextResponse.json({ content: { suggestions: rows.length } });
  } catch (error) {
    console.error("Suggest scenes failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
