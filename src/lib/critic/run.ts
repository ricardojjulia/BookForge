import { estimateAiCallPlan } from "@/lib/ai/call-planner";
import { buildCriticPrompt } from "@/lib/critic/prompts";
import { extractCriticScore } from "@/lib/critic/score";
import { summarizeCriticContent } from "@/lib/critic/summary";
import { createLmStudioClient } from "@/lib/lmstudio/client";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import type { CriticLens } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

type CriticStage = "baseline" | "post_rewrite";

type ChapterRow = {
  id: string;
  title: string | null;
  summary: string | null;
};

type ParagraphRow = {
  chapter_id: string;
  paragraph_number: number;
  original_text: string;
  accepted_text: string | null;
};

export async function runCriticLens(input: {
  supabase: SupabaseClient;
  bookId: string;
  userId: string;
  lens: CriticLens;
  stage?: CriticStage;
}) {
  const stage = input.stage || "baseline";
  const [
    { data: book, error: bookError },
    { data: bible },
    { data: chapters, error: chaptersError },
    { data: paragraphsForContext },
    { count: scenes },
    { count: paragraphs },
  ] = await Promise.all([
    input.supabase.from("books").select("title").eq("id", input.bookId).single(),
    input.supabase.from("book_bibles").select("content").eq("book_id", input.bookId).maybeSingle(),
    input.supabase.from("chapters").select("id,title,summary").eq("book_id", input.bookId).order("chapter_number"),
    stage === "post_rewrite"
      ? input.supabase
          .from("paragraphs")
          .select("chapter_id,paragraph_number,original_text,accepted_text")
          .eq("book_id", input.bookId)
          .order("paragraph_number")
      : Promise.resolve({ data: [] }),
    input.supabase.from("scenes").select("id", { count: "exact", head: true }).eq("book_id", input.bookId),
    input.supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", input.bookId),
  ]);

  if (bookError) throw bookError;
  if (chaptersError) throw chaptersError;

  const settings = await getUserLmStudioSettings(input.userId);
  const client = createLmStudioClient(settings);
  const model = settings.reasoningModel || settings.primaryRewriteModel || "local-model";
  const chapterRows = (chapters || []) as ChapterRow[];
  const plan = estimateAiCallPlan({
    task: "critic",
    selectedModel: model,
    qualityProfile: settings.qualityProfile,
    contextWindowTokens: settings.contextWindowTokens,
    maxOutputTokens: settings.maxOutputTokens,
    chapterCount: chapterRows.length,
    sceneCount: scenes || 0,
    paragraphCount: paragraphs || 0,
  });

  const prompt = buildCriticPrompt({
    title: book.title,
    bookBible: bible?.content,
    chapterSummaries: chapterRows.map((chapter) => ({
      title: chapter.title || "Untitled chapter",
      summary: chapter.summary,
    })),
    acceptedRevisionContext:
      stage === "post_rewrite"
        ? buildAcceptedRevisionContext(chapterRows, (paragraphsForContext || []) as ParagraphRow[])
        : undefined,
    rewriteStage: stage,
    lens: input.lens,
  });

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    top_p: settings.topP,
    max_tokens: settings.maxOutputTokens,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "text" },
  });

  const parsed = parseModelJsonOrFallback(completion.choices[0]?.message.content || "{}", (raw, parseError) => ({
    score: null,
    executiveSummary: raw,
    strengths: [],
    risks: [],
    highestLeverageFixes: [],
    chapterNotes: [],
    continuityFlags: [],
    voiceAndStyleNotes: [],
    marketPositioning: [],
    nextRevisionPlan: [],
    parseWarning: parseError,
    rawModelResponse: raw,
  }));
  const parsedContent =
    typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : { executiveSummary: String(parsed) };
  const numericScore = extractCriticScore(parsedContent);
  const executiveSummary = summarizeCriticContent(parsedContent);
  const content = {
    ...parsedContent,
    ...(parsedContent.score && typeof parsedContent.score === "object" ? { scoreBreakdown: parsedContent.score } : {}),
    executiveSummary,
    score: numericScore,
    rewriteStage: stage,
    aiCallPlan: {
      ...plan,
      expectedCalls: 1,
      actualCalls: 1,
    },
  };

  const { error: reportError } = await input.supabase.from("coherence_reports").insert({
    book_id: input.bookId,
    report_type: stage === "post_rewrite" ? `critic_post:${input.lens}` : `critic:${input.lens}`,
    content,
  });
  if (reportError) throw reportError;

  return content;
}

function buildAcceptedRevisionContext(chapters: ChapterRow[], paragraphs: ParagraphRow[]) {
  const paragraphsByChapter = paragraphs.reduce<Record<string, ParagraphRow[]>>((groups, paragraph) => {
    groups[paragraph.chapter_id] ||= [];
    groups[paragraph.chapter_id].push(paragraph);
    return groups;
  }, {});

  let remainingContextCharacters = 14000;

  return chapters.map((chapter) => {
    const chapterParagraphs = (paragraphsByChapter[chapter.id] || []).sort((a, b) => a.paragraph_number - b.paragraph_number);
    const acceptedParagraphs = chapterParagraphs.filter((paragraph) => paragraph.accepted_text);
    const perChapterLimit = Math.max(300, Math.min(1200, Math.floor(remainingContextCharacters / Math.max(1, chapters.length))));
    const sample =
      remainingContextCharacters > 0
        ? chapterParagraphs
            .map((paragraph) => paragraph.accepted_text || paragraph.original_text)
            .join("\n\n")
            .slice(0, perChapterLimit)
        : "";
    remainingContextCharacters = Math.max(0, remainingContextCharacters - sample.length);

    return {
      title: chapter.title || "Untitled chapter",
      acceptedTextSample: sample,
      acceptedParagraphs: acceptedParagraphs.length,
      totalParagraphs: chapterParagraphs.length,
    };
  });
}
