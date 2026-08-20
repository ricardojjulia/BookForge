import OpenAI from "openai";
import { createProviderClient, PROVIDER_META, providerChatCompletion } from "@/lib/ai/providers";
import { createManagedChatCompletion, createLmStudioClient } from "@/lib/lmstudio/client";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getReasoningModelCandidates } from "@/lib/lmstudio/model-selection";
import { selectAndPrepareLmStudioModel } from "@/lib/lmstudio/orchestrator";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { assertModelAllowedForUser } from "@/lib/subscription/enforcement";

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

type ChapterRow = {
  id: string;
  chapter_number: number;
  title: string | null;
  summary: string | null;
};

type ParagraphRow = {
  chapter_id: string;
  paragraph_number: number;
  original_text: string;
  accepted_text: string | null;
};

type JudgeRun = {
  judgeId: string;
  provider: "lmstudio" | "cloud";
  model: string;
  content: Record<string, unknown>;
};

export type PublishingLabBundle = {
  judges: Array<{
    judgeId: string;
    provider: string;
    model: string;
    score: number | null;
    verdict: string;
  }>;
  consensus: {
    publicationReadinessScore: number | null;
    verdict: string;
    readerImpact: string;
    strengths: string[];
    concerns: string[];
    actionableFixes: string[];
    consensusNotes: string;
  };
  assets: {
    description: string;
    dedication: string;
    frontMatter: string;
    backMatter: string;
    authorBiography: string;
  };
  covers: Array<{
    version: number;
    styleName: string;
    subtitle: string;
    blurb: string;
    svg: string;
    imageUrl: string | null;
    imageProvider: string | null;
  }>;
  manuscriptSnapshot: {
    chapterCount: number;
    paragraphCount: number;
    sampledCharacters: number;
  };
  generatedAt: string;
};

export async function runPublishingLab(input: {
  supabase: SupabaseClient;
  bookId: string;
  userId: string;
}) {
  const [{ data: book, error: bookError }, { data: chapters }, { data: paragraphs }] = await Promise.all([
    input.supabase
      .from("books")
      .select("id,title,author_name,genre,target_audience,status")
      .eq("id", input.bookId)
      .single(),
    input.supabase
      .from("chapters")
      .select("id,chapter_number,title,summary")
      .eq("book_id", input.bookId)
      .order("chapter_number"),
    input.supabase
      .from("paragraphs")
      .select("chapter_id,paragraph_number,original_text,accepted_text")
      .eq("book_id", input.bookId)
      .order("paragraph_number"),
  ]);

  if (bookError) throw bookError;
  if (!book) throw new Error("Book not found.");
  if (book.status !== "finished") {
    throw new Error("Publishing Lab is only available after a book is marked as finished.");
  }

  const chapterRows = (chapters || []) as ChapterRow[];
  const paragraphRows = (paragraphs || []) as ParagraphRow[];
  const manuscriptSample = buildManuscriptSample(chapterRows, paragraphRows, 36000);

  const settings = await getUserLmStudioSettings(input.userId);
  const prompt = buildPublishingLabPrompt({
    title: book.title,
    authorName: book.author_name || "Unknown Author",
    genre: book.genre || "Unspecified",
    targetAudience: book.target_audience || "General audience",
    chapterRows,
    manuscriptSample,
  });

  const judges: JudgeRun[] = [];

  const localJudge = await runLocalJudge(settings, prompt, { supabase: input.supabase, userId: input.userId });
  if (localJudge) judges.push(localJudge);

  const cloudJudge = await runCloudJudge(settings, prompt, { supabase: input.supabase, userId: input.userId });
  if (cloudJudge) judges.push(cloudJudge);

  if (!judges.length) {
    throw new Error("No AI judge is configured. Configure LM Studio and/or a cloud provider first.");
  }

  const bundle = buildConsensusBundle({
    title: book.title,
    authorName: book.author_name || "Unknown Author",
    judges,
    chapterCount: chapterRows.length,
    paragraphCount: paragraphRows.length,
    sampledCharacters: manuscriptSample.length,
  });
  const enrichedBundle = await maybeGenerateRealCoverImages({
    bundle,
    title: book.title,
    authorName: book.author_name || "Unknown Author",
    genre: book.genre || "Unspecified",
    settings,
  });

  const { error: reportError } = await input.supabase.from("coherence_reports").insert({
    book_id: input.bookId,
    report_type: "publishing_lab_bundle",
    content: enrichedBundle,
  });
  if (reportError) throw reportError;

  return enrichedBundle;
}

async function runLocalJudge(
  settings: Awaited<ReturnType<typeof getUserLmStudioSettings>>,
  prompt: string,
  telemetry: { supabase: SupabaseClient; userId: string },
): Promise<JudgeRun | null> {
  try {
    const localPlan = await selectAndPrepareLmStudioModel(settings, {
      task: "critic",
      candidates: getReasoningModelCandidates(settings),
      expectedCalls: 1,
      latencyPreference: "quality",
      allowModelLoad: false,
      telemetry,
    });

    const client = createLmStudioClient(settings);
    const completion = await createManagedChatCompletion(
      client,
      localPlan.preparedModel,
      {
        temperature: 0.35,
        top_p: settings.topP,
        messages: [{ role: "user", content: prompt }],
      },
      undefined,
      localPlan.telemetryContext,
    );

    const raw = completion.choices[0]?.message?.content || "";
    return {
      judgeId: "local_lmstudio",
      provider: "lmstudio",
      model: localPlan.model,
      content: normalizeJudgeContent(raw),
    };
  } catch {
    return null;
  }
}

async function runCloudJudge(
  settings: Awaited<ReturnType<typeof getUserLmStudioSettings>>,
  prompt: string,
  telemetry: { supabase: SupabaseClient; userId: string },
): Promise<JudgeRun | null> {
  if (!settings.standardSettings) return null;

  try {
    const meta = PROVIDER_META.find((p) => p.id === settings.standardSettings!.provider);
    const model = settings.standardSettings.model || meta?.defaultModels[0] || "gpt-4o";

    // This bypasses the orchestrator entirely (providerChatCompletion below,
    // not createManagedChatCompletion), so it needs its own explicit gate --
    // see src/lib/subscription/enforcement.ts.
    await assertModelAllowedForUser(telemetry.supabase, { userId: telemetry.userId, model, task: "critic" });

    const completion = await providerChatCompletion(settings.standardSettings, {
      model,
      temperature: settings.standardSettings.temperature ?? 0.35,
      max_tokens: settings.standardSettings.maxOutputTokens ?? 2400,
      messages: [{ role: "user", content: prompt }] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "";
    return {
      judgeId: "cloud_provider",
      provider: "cloud",
      model,
      content: normalizeJudgeContent(raw),
    };
  } catch {
    return null;
  }
}

function normalizeJudgeContent(raw: string) {
  const parsed = parseModelJsonOrFallback(raw, (unsafeRaw, parseError) => ({
    criticAnalysis: {
      publicationReadinessScore: null,
      verdict: "Model output could not be parsed as JSON.",
      readerImpact: unsafeRaw.slice(0, 1200),
      strengths: [],
      concerns: [parseError],
      actionableFixes: ["Re-run Publishing Lab after checking model connectivity."],
    },
    assets: {
      description: unsafeRaw.slice(0, 1000),
      dedication: "",
      frontMatter: "",
      backMatter: "",
      authorBiography: "",
    },
    coverConcepts: [],
  }));

  return (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
}

function buildConsensusBundle(input: {
  title: string;
  authorName: string;
  judges: JudgeRun[];
  chapterCount: number;
  paragraphCount: number;
  sampledCharacters: number;
}): PublishingLabBundle {
  const judgeViews = input.judges.map((judge) => {
    const analysis = objectValue(judge.content.criticAnalysis);
    return {
      judgeId: judge.judgeId,
      provider: judge.provider,
      model: judge.model,
      score: numberValue(analysis.publicationReadinessScore),
      verdict: stringValue(analysis.verdict) || stringValue(analysis.summary) || "No verdict returned.",
      readerImpact: stringValue(analysis.readerImpact),
      strengths: stringArray(analysis.strengths),
      concerns: stringArray(analysis.concerns),
      actionableFixes: stringArray(analysis.actionableFixes),
      assets: objectValue(judge.content.assets),
      coverConcepts: arrayValue(judge.content.coverConcepts).map((item) => objectValue(item)),
    };
  });

  const scores = judgeViews.map((item) => item.score).filter((value): value is number => typeof value === "number");
  const consensusScore = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;

  const verdict = longestText(judgeViews.map((item) => item.verdict)) || "No verdict returned.";
  const readerImpact = longestText(judgeViews.map((item) => item.readerImpact));
  const strengths = dedupeStrings(judgeViews.flatMap((item) => item.strengths)).slice(0, 8);
  const concerns = dedupeStrings(judgeViews.flatMap((item) => item.concerns)).slice(0, 8);
  const actionableFixes = dedupeStrings(judgeViews.flatMap((item) => item.actionableFixes)).slice(0, 10);

  const mergedAssets = {
    description: longestText(judgeViews.map((item) => stringValue(item.assets.description))),
    dedication: longestText(judgeViews.map((item) => stringValue(item.assets.dedication))),
    frontMatter: longestText(judgeViews.map((item) => stringValue(item.assets.frontMatter))),
    backMatter: longestText(judgeViews.map((item) => stringValue(item.assets.backMatter))),
    authorBiography: longestText(judgeViews.map((item) => stringValue(item.assets.authorBiography))),
  };

  const coverSeed = judgeViews.flatMap((item) =>
    item.coverConcepts.map((concept) => ({
      styleName: stringValue(concept.styleName) || "Editorial",
      subtitle: stringValue(concept.subtitle) || "A novel",
      blurb: stringValue(concept.blurb) || "A story that lingers beyond the final page.",
      colorA: stringValue(concept.colorA) || "#151515",
      colorB: stringValue(concept.colorB) || "#b88a44",
      colorC: stringValue(concept.colorC) || "#f4efe7",
    })),
  );

  const coverConcepts = ensureCoverConcepts(coverSeed);
  const covers = coverConcepts.slice(0, 3).map((concept, index) => ({
    version: index + 1,
    styleName: concept.styleName,
    subtitle: concept.subtitle,
    blurb: concept.blurb,
    svg: renderCoverSvg({
      title: input.title,
      author: input.authorName,
      styleName: concept.styleName,
      subtitle: concept.subtitle,
      blurb: concept.blurb,
      colorA: concept.colorA,
      colorB: concept.colorB,
      colorC: concept.colorC,
      variant: index + 1,
    }),
    imageUrl: null,
    imageProvider: null,
  }));

  const consensusNotes =
    input.judges.length > 1
      ? `Consensus built from ${input.judges.length} judges (${input.judges.map((j) => `${j.provider}:${j.model}`).join(", ")}).`
      : `Single-judge result from ${input.judges[0]?.provider}:${input.judges[0]?.model}.`;

  return {
    judges: judgeViews.map((view) => ({
      judgeId: view.judgeId,
      provider: view.provider,
      model: view.model,
      score: view.score,
      verdict: view.verdict,
    })),
    consensus: {
      publicationReadinessScore: consensusScore,
      verdict,
      readerImpact,
      strengths,
      concerns,
      actionableFixes,
      consensusNotes,
    },
    assets: {
      description: mergedAssets.description,
      dedication: mergedAssets.dedication,
      frontMatter: mergedAssets.frontMatter,
      backMatter: mergedAssets.backMatter,
      authorBiography: mergedAssets.authorBiography,
    },
    covers,
    manuscriptSnapshot: {
      chapterCount: input.chapterCount,
      paragraphCount: input.paragraphCount,
      sampledCharacters: input.sampledCharacters,
    },
    generatedAt: new Date().toISOString(),
  };
}

async function maybeGenerateRealCoverImages(input: {
  bundle: PublishingLabBundle;
  title: string;
  authorName: string;
  genre: string;
  settings: Awaited<ReturnType<typeof getUserLmStudioSettings>>;
}) {
  const settings = input.settings.standardSettings;
  if (!settings || settings.provider !== "openai") {
    return input.bundle;
  }

  try {
    const client = createProviderClient(settings);
    const imageModel = settings.model?.includes("image") ? settings.model : "gpt-image-1";

    const generated = await Promise.all(
      input.bundle.covers.map(async (cover) => {
        try {
          const prompt = [
            "Generate a high-quality book cover image.",
            `Title text on cover: ${input.title}`,
            `Author text on cover: ${input.authorName}`,
            `Genre: ${input.genre}`,
            `Style direction: ${cover.styleName}`,
            `Subtitle mood: ${cover.subtitle}`,
            `Back-cover blurb mood: ${cover.blurb}`,
            "Design constraints: cinematic publishing quality, readable typography, clear hierarchy, no watermarks.",
            "The image must include title and author text visibly.",
          ].join("\n");

          const response = (await client.images.generate({
            model: imageModel,
            prompt,
            size: "1024x1536",
            response_format: "url",
          } as OpenAI.Images.ImageGenerateParams)) as unknown as {
            data?: Array<{ url?: string | null }>;
          };

          const imageUrl = response?.data?.[0]?.url || null;
          return {
            ...cover,
            imageUrl,
            imageProvider: imageUrl ? `openai:${imageModel}` : null,
          };
        } catch {
          return cover;
        }
      }),
    );

    return {
      ...input.bundle,
      covers: generated,
    };
  } catch {
    return input.bundle;
  }
}

function buildPublishingLabPrompt(input: {
  title: string;
  authorName: string;
  genre: string;
  targetAudience: string;
  chapterRows: ChapterRow[];
  manuscriptSample: string;
}) {
  return `You are BookForge Ultimate Critic.\n\nEvaluate this FINISHED manuscript from three perspectives at once:\n1) critic/editor\n2) human reader\n3) honest market reality\n\nBe candid and useful. Avoid empty praise.\n\nReturn ONLY JSON with this exact shape:\n{\n  "criticAnalysis": {\n    "publicationReadinessScore": <integer 0-100>,\n    "verdict": "<1-3 sentence judgment>",\n    "readerImpact": "<reader-emotion and engagement analysis>",\n    "strengths": ["..."],\n    "concerns": ["..."],\n    "actionableFixes": ["..."]\n  },\n  "assets": {\n    "description": "<150-220 words sales description>",\n    "dedication": "<short dedication>",\n    "frontMatter": "<front matter draft>",\n    "backMatter": "<back matter draft>",\n    "authorBiography": "<120-180 words author bio>"\n  },\n  "coverConcepts": [\n    {\n      "styleName": "...",\n      "subtitle": "...",\n      "blurb": "...",\n      "colorA": "#RRGGBB",\n      "colorB": "#RRGGBB",\n      "colorC": "#RRGGBB"\n    }\n  ]\n}\n\nConstraints:\n- Provide 3 coverConcepts minimum.\n- Keep concerns brutally honest but constructive.\n- Cover concepts must include title and author treatment ideas through subtitle/blurb language.\n\nBOOK\nTitle: ${input.title}\nAuthor: ${input.authorName}\nGenre: ${input.genre}\nTarget audience: ${input.targetAudience}\nChapter count: ${input.chapterRows.length}\n\nChapter map:\n${input.chapterRows
    .map((chapter) => `${chapter.chapter_number}. ${chapter.title || "Untitled"} - ${(chapter.summary || "No summary").slice(0, 300)}`)
    .join("\n")}\n\nManuscript sample:\n${input.manuscriptSample}`;
}

function buildManuscriptSample(chapters: ChapterRow[], paragraphs: ParagraphRow[], maxChars: number) {
  const chapterOrder = new Map(chapters.map((chapter, index) => [chapter.id, index]));
  const sortedParagraphs = [...paragraphs].sort((a, b) => {
    const chapterA = chapterOrder.get(a.chapter_id) ?? 9999;
    const chapterB = chapterOrder.get(b.chapter_id) ?? 9999;
    if (chapterA !== chapterB) return chapterA - chapterB;
    return a.paragraph_number - b.paragraph_number;
  });

  const segments: string[] = [];
  let used = 0;
  for (const paragraph of sortedParagraphs) {
    const text = (paragraph.accepted_text || paragraph.original_text || "").trim();
    if (!text) continue;
    const candidate = `${text}\n\n`;
    if (used + candidate.length > maxChars) break;
    segments.push(candidate);
    used += candidate.length;
  }

  return segments.join("").trim();
}

function ensureCoverConcepts(concepts: Array<{ styleName: string; subtitle: string; blurb: string; colorA: string; colorB: string; colorC: string }>) {
  const fallback = [
    {
      styleName: "Cinematic Drama",
      subtitle: "A story that tests the soul",
      blurb: "Hope, fracture, and the cost of becoming whole.",
      colorA: "#101820",
      colorB: "#d97b29",
      colorC: "#f3ede1",
    },
    {
      styleName: "Literary Minimal",
      subtitle: "A novel of memory and grace",
      blurb: "Quiet sentences. Lasting impact.",
      colorA: "#18212c",
      colorB: "#7ca0b8",
      colorC: "#f8f6f1",
    },
    {
      styleName: "Bold Commercial",
      subtitle: "A page-turner with heart",
      blurb: "Urgent stakes, unforgettable characters.",
      colorA: "#2a1217",
      colorB: "#d94949",
      colorC: "#fff1e8",
    },
  ];

  const merged = [...concepts];
  for (const item of fallback) {
    if (merged.length >= 3) break;
    merged.push(item);
  }
  return merged.slice(0, 3);
}

function renderCoverSvg(input: {
  title: string;
  author: string;
  styleName: string;
  subtitle: string;
  blurb: string;
  colorA: string;
  colorB: string;
  colorC: string;
  variant: number;
}) {
  const title = escapeXml(input.title);
  const author = escapeXml(input.author);
  const subtitle = escapeXml(input.subtitle);
  const blurb = escapeXml(input.blurb);
  const styleName = escapeXml(input.styleName);
  const patternOpacity = input.variant === 1 ? "0.14" : input.variant === 2 ? "0.2" : "0.1";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2560" viewBox="0 0 1600 2560" role="img" aria-label="${title} cover concept">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${input.colorA}"/>
      <stop offset="65%" stop-color="${input.colorB}"/>
      <stop offset="100%" stop-color="${input.colorC}"/>
    </linearGradient>
    <pattern id="grain" width="80" height="80" patternUnits="userSpaceOnUse">
      <circle cx="8" cy="8" r="2" fill="#ffffff" fill-opacity="${patternOpacity}"/>
      <circle cx="48" cy="30" r="1.5" fill="#ffffff" fill-opacity="${patternOpacity}"/>
      <circle cx="24" cy="58" r="1.2" fill="#ffffff" fill-opacity="${patternOpacity}"/>
      <circle cx="70" cy="70" r="1.3" fill="#ffffff" fill-opacity="${patternOpacity}"/>
    </pattern>
  </defs>
  <rect width="1600" height="2560" fill="url(#bg)"/>
  <rect width="1600" height="2560" fill="url(#grain)"/>

  <rect x="120" y="120" width="1360" height="2320" rx="34" fill="#000000" fill-opacity="0.12"/>
  <text x="180" y="340" fill="#ffffff" fill-opacity="0.86" font-size="42" font-family="Georgia, 'Times New Roman', serif" letter-spacing="4">${styleName.toUpperCase()}</text>

  <text x="180" y="780" fill="#ffffff" font-size="138" font-weight="700" font-family="Georgia, 'Times New Roman', serif" letter-spacing="1">${title}</text>
  <text x="180" y="930" fill="#ffffff" fill-opacity="0.92" font-size="56" font-family="Arial, sans-serif">${subtitle}</text>

  <rect x="180" y="1030" width="1240" height="3" fill="#ffffff" fill-opacity="0.45"/>

  <foreignObject x="180" y="1140" width="1240" height="520">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;color:#ffffff;font-size:42px;line-height:1.35;opacity:0.95;">
      ${blurb}
    </div>
  </foreignObject>

  <text x="180" y="2240" fill="#ffffff" font-size="52" font-weight="600" font-family="Arial, sans-serif" letter-spacing="2">${author.toUpperCase()}</text>
</svg>`;
}

function dedupeStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function longestText(items: string[]) {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || "";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(Math.max(0, Math.min(100, value)));
  if (typeof value === "string") {
    const parsed = Number(value.match(/\d+(?:\.\d+)?/)?.[0] || NaN);
    if (Number.isFinite(parsed)) return Math.round(Math.max(0, Math.min(100, parsed)));
  }
  return null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown) {
  return arrayValue(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
