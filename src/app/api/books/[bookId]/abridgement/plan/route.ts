import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAbridgementPlanPrompt } from "@/lib/abridgement/prompt";
import { createManagedChatCompletion } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getReasoningModelCandidates } from "@/lib/lmstudio/model-selection";
import { selectAndPrepareActiveModel } from "@/lib/lmstudio/orchestrator";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  targetReductionPercent: z.number().int().min(5).max(60).default(25),
});

type ChapterRow = {
  id: string;
  chapter_number: number;
  title: string | null;
  summary: string | null;
};

type ParagraphRow = {
  id: string;
  chapter_id: string;
  paragraph_number: number;
  original_text: string;
};

type Suggestion = {
  suggestionType?: string;
  chapterNumber?: number;
  targetChapterNumber?: number;
  paragraphNumber?: number;
  title?: string;
  rationale?: string;
  estimatedWordSavings?: number;
  continuityRisk?: string;
};

function getErrorMessage(error: unknown) {
  const lmStudioMessage = getLmStudioErrorMessage(error, "");
  if (lmStudioMessage) return lmStudioMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return "Unable to generate abridgement plan.";
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const body = schema.parse(await readJsonBody(request));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const [{ data: book, error: bookError }, { data: bible }, { data: chapters, error: chaptersError }, { data: paragraphs, error: paragraphsError }] =
      await Promise.all([
        supabase.from("books").select("title").eq("id", bookId).single(),
        supabase.from("book_bibles").select("content").eq("book_id", bookId).maybeSingle(),
        supabase
          .from("chapters")
          .select("id,chapter_number,title,summary")
          .eq("book_id", bookId)
          .order("chapter_number"),
        supabase
          .from("paragraphs")
          .select("id,chapter_id,paragraph_number,original_text")
          .eq("book_id", bookId)
          .order("paragraph_number"),
      ]);
    if (bookError) throw bookError;
    if (chaptersError) throw chaptersError;
    if (paragraphsError) throw paragraphsError;

    const chapterRows = (chapters || []) as ChapterRow[];
    const paragraphRows = (paragraphs || []) as ParagraphRow[];
    const inventory = buildInventory(chapterRows, paragraphRows);
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
        temperature: Math.min(settings.temperature, 0.35),
        top_p: settings.topP,
        max_tokens: 5000,
        messages: [
          {
            role: "user",
            content: buildAbridgementPlanPrompt({
              title: book.title,
              targetReductionPercent: body.targetReductionPercent,
              manuscriptBlueprint: bible?.content,
              chapters: inventory,
            }),
          },
        ],
      },
      undefined,
      telemetryContext,
    );

    const parsed = parseModelJsonOrFallback(completion.choices[0]?.message.content || "{}", (raw, parseError) => ({
      summary: raw,
      estimatedOverallReductionPercent: body.targetReductionPercent,
      suggestions: [],
      doNotCut: [],
      humanDecisionsNeeded: [],
      parseWarning: parseError,
    })) as Record<string, unknown>;
    parsed.modelSelection = modelSelection;
    parsed.lmStudioRuntimeLimits = preparedModel.runtimeLimits;
    parsed.lmStudioWarnings = preparedModel.warnings;

    const now = new Date().toISOString();
    const { data: plan, error: planError } = await supabase
      .from("abridgement_plans")
      .insert({
        book_id: bookId,
        created_by: user.id,
        target_reduction_percent: body.targetReductionPercent,
        status: "draft",
        summary: stringValue(parsed.summary) || "Abridgement plan generated.",
        content: parsed,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (planError) throw planError;

    const chapterByNumber = new Map(chapterRows.map((chapter) => [chapter.chapter_number, chapter]));
    const paragraphByChapterAndNumber = new Map(
      paragraphRows.map((paragraph) => [`${paragraph.chapter_id}:${paragraph.paragraph_number}`, paragraph]),
    );
    const suggestions = Array.isArray(parsed.suggestions) ? (parsed.suggestions as Suggestion[]) : [];
    const rows = suggestions.slice(0, 80).map((suggestion) => {
      const chapter = chapterByNumber.get(Number(suggestion.chapterNumber));
      const targetChapter = chapterByNumber.get(Number(suggestion.targetChapterNumber));
      const paragraph = chapter ? paragraphByChapterAndNumber.get(`${chapter.id}:${Number(suggestion.paragraphNumber)}`) : null;
      return {
        plan_id: plan.id,
        book_id: bookId,
        suggestion_type: normalizeSuggestionType(suggestion.suggestionType),
        chapter_id: chapter?.id || null,
        target_chapter_id: targetChapter?.id || null,
        paragraph_id: paragraph?.id || null,
        title: stringValue(suggestion.title) || "Abridgement suggestion",
        rationale: stringValue(suggestion.rationale),
        estimated_word_savings: Math.max(0, Number(suggestion.estimatedWordSavings || 0)),
        continuity_risk: normalizeRisk(suggestion.continuityRisk),
        status: "pending",
      };
    });

    if (rows.length) {
      const { error: suggestionsError } = await supabase.from("abridgement_suggestions").insert(rows);
      if (suggestionsError) throw suggestionsError;
    }

    return NextResponse.json({ content: { planId: plan.id, suggestions: rows.length, summary: parsed.summary } });
  } catch (error) {
    console.error("Abridgement plan failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function buildInventory(chapters: ChapterRow[], paragraphs: ParagraphRow[]) {
  const byChapter = paragraphs.reduce<Record<string, ParagraphRow[]>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});

  return chapters.map((chapter) => {
    const chapterParagraphs = byChapter[chapter.id] || [];
    const text = chapterParagraphs.map((paragraph) => paragraph.original_text).join("\n\n");
    return {
      id: chapter.id,
      chapterNumber: chapter.chapter_number,
      title: chapter.title || `Chapter ${chapter.chapter_number}`,
      summary: chapter.summary,
      paragraphCount: chapterParagraphs.length,
      wordCount: countWords(text),
      sample: text.slice(0, 2400),
    };
  });
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeSuggestionType(value: unknown) {
  const allowed = new Set(["cut_chapter", "merge_chapter", "cut_scene", "merge_scene", "cut_paragraph", "tighten_paragraph"]);
  const normalized = stringValue(value);
  return allowed.has(normalized) ? normalized : "tighten_paragraph";
}

function normalizeRisk(value: unknown) {
  const normalized = stringValue(value).toLowerCase();
  if (normalized === "low" || normalized === "high") return normalized;
  return "medium";
}
