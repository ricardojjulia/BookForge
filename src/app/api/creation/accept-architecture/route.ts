import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

function coerceToNumber(val: unknown): unknown {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const match = val.match(/\d+/);
    return match ? Number(match[0]) : undefined;
  }
  return val;
}

const coercedNumber = z.preprocess(coerceToNumber, z.number().nonnegative().optional());
const coercedInt = z.preprocess(coerceToNumber, z.number().int().nonnegative().optional());

const chapterSchema = z.object({
  chapterNumber: coercedInt,
  title: z.string().optional(),
  purpose: z.string().optional(),
  targetWords: coercedInt,
  targetPages: coercedNumber,
  emotionalMovement: z.string().optional(),
  keyBeats: z.array(z.unknown()).optional(),
  charactersOrConcepts: z.array(z.unknown()).optional(),
  continuityNotes: z.array(z.unknown()).optional(),
  riskNotes: z.array(z.unknown()).optional(),
});

const architectureSchema = z.object({
  architectureSummary: z.string().optional(),
  parts: z
    .array(
      z.object({
        partNumber: coercedInt,
        title: z.string().optional(),
        purpose: z.string().optional(),
        chapters: z.array(chapterSchema).optional(),
      }),
    )
    .optional(),
  globalContinuityRules: z.array(z.unknown()).optional(),
  voiceRules: z.array(z.unknown()).optional(),
  motifsToDevelop: z.array(z.unknown()).optional(),
  generationWarnings: z.array(z.unknown()).optional(),
});

const schema = z.object({
  creationProjectId: z.string().uuid(),
  architecture: architectureSchema,
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to accept architecture.";
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

    const { data: acceptedConceptVersion } = await supabase
      .from("creation_plan_versions")
      .select("id,content,created_at")
      .eq("creation_project_id", project.id)
      .eq("version_type", "concept")
      .eq("accepted", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const requestedTargetPages = Math.max(20, Math.min(200, Math.round(Number(project.target_pages || 120))));
    const normalizedArchitecture = normalizeArchitectureToTargetPages(body.architecture, requestedTargetPages);
    const chapters = flattenArchitectureChapters(normalizedArchitecture);
    if (!chapters.length) {
      return NextResponse.json({ error: "Architecture must include at least one chapter." }, { status: 400 });
    }

    await supabase
      .from("creation_plan_versions")
      .update({ accepted: false })
      .eq("creation_project_id", project.id)
      .eq("version_type", "architecture");

    const { error: architectureError } = await supabase.from("creation_plan_versions").insert({
      creation_project_id: project.id,
      version_type: "architecture",
      content: normalizedArchitecture,
      accepted: true,
    });
    if (architectureError) throw architectureError;

    const { data: projectRow, error: createProjectError } = await supabase
      .from("projects")
      .insert({
        owner_id: user.id,
        name: `${project.working_title} Project`,
        description: "Created from BookForge Creator architecture.",
      })
      .select("id")
      .single();
    if (createProjectError) throw createProjectError;

    const bookInsertBase = {
      project_id: projectRow.id,
      owner_id: user.id,
      title: project.working_title,
      author_name: "",
      genre: project.genre,
      target_audience: project.target_audience,
      dialog_density: project.dialog_density || "normal",
      status: "planned",
    };

    const metadataPayload = {
      creationSeed: {
        source: "bookforge_creator",
        creationProjectId: project.id,
        acceptedAt: new Date().toISOString(),
        tone: project.tone || null,
        language: project.language || null,
        targetPages: project.target_pages || null,
        acceptedConceptVersionId: acceptedConceptVersion?.id || null,
        acceptedConceptCreatedAt: acceptedConceptVersion?.created_at || null,
        acceptedConcept: acceptedConceptVersion?.content || null,
        acceptedArchitecture: normalizedArchitecture,
      },
    };

    let { data: book, error: bookError } = await supabase
      .from("books")
      .insert({
        ...bookInsertBase,
        metadata: metadataPayload,
      })
      .select("id")
      .single();

    if (bookError) {
      const message = String(bookError.message || "").toLowerCase();
      const metadataMissing = message.includes("metadata") && message.includes("column");
      if (metadataMissing) {
        const retry = await supabase
          .from("books")
          .insert(bookInsertBase)
          .select("id")
          .single();
        book = retry.data;
        bookError = retry.error;
      }
    }

    if (bookError) throw bookError;
    if (!book?.id) throw new Error("Unable to create book record.");

    for (const chapter of chapters) {
      const originalText = buildPlaceholderChapterText(chapter);
      const { error: chapterError } = await supabase.from("chapters").insert({
        book_id: book.id,
        chapter_number: chapter.chapterNumber,
        title: chapter.title,
        original_text: originalText,
        current_text: originalText,
        summary: chapter.purpose,
        status: "planned",
      });
      if (chapterError) throw chapterError;
    }

    const { error: updateError } = await supabase
      .from("creation_projects")
      .update({
        status: "approved",
        created_book_id: book.id,
        metadata: {
          acceptedArchitectureAt: new Date().toISOString(),
          chapterCount: chapters.length,
          targetPages: requestedTargetPages,
          provenance: "ai_created_first_draft_planned",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", project.id);
    if (updateError) throw updateError;

    return NextResponse.json({
      content: {
        bookId: book.id,
        chapterCount: chapters.length,
        targetPages: requestedTargetPages,
      },
    });
  } catch (error) {
    console.error("Accept architecture failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function flattenArchitectureChapters(architecture: z.infer<typeof architectureSchema>) {
  let fallbackNumber = 1;
  return (architecture.parts || [])
    .flatMap((part) =>
      (part.chapters || []).map((chapter) => ({
        ...chapter,
        partTitle: part.title || "",
        chapterNumber: chapter.chapterNumber || fallbackNumber++,
        title: chapter.title?.trim() || `Chapter ${chapter.chapterNumber || fallbackNumber}`,
      })),
    )
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((chapter, index) => ({
      ...chapter,
      chapterNumber: index + 1,
    }));
}

function buildPlaceholderChapterText(chapter: ReturnType<typeof flattenArchitectureChapters>[number]) {
  const lines = [
    chapter.title,
    "",
    chapter.purpose ? `Purpose: ${chapter.purpose}` : "",
    chapter.emotionalMovement ? `Emotional movement: ${chapter.emotionalMovement}` : "",
    chapter.targetWords ? `Target words: ${chapter.targetWords}` : "",
    "",
    "Draft text has not been generated yet. This planned chapter shell was created from BookForge Creator architecture.",
  ].filter(Boolean);
  return lines.join("\n");
}

function normalizeArchitectureToTargetPages(
  architecture: z.infer<typeof architectureSchema>,
  requestedTargetPages: number,
) {
  const flat = flattenArchitectureChapters(architecture);
  if (!flat.length) return architecture;

  const totalTargetWords = Math.max(4000, Math.round(requestedTargetPages * 275));
  const rawWeights = flat.map((chapter) => {
    if (typeof chapter.targetWords === "number" && chapter.targetWords > 0) return chapter.targetWords;
    if (typeof chapter.targetPages === "number" && chapter.targetPages > 0) return chapter.targetPages * 275;
    return 1;
  });
  const weightSum = rawWeights.reduce((sum, weight) => sum + weight, 0) || flat.length;

  const rawPages = rawWeights.map((weight) => (weight / weightSum) * requestedTargetPages);
  const distributedPages = rawPages.map((pageCount) => Math.max(1, Math.round(pageCount)));
  let pageDiff = requestedTargetPages - distributedPages.reduce((sum, pageCount) => sum + pageCount, 0);

  while (pageDiff !== 0) {
    if (pageDiff > 0) {
      for (let index = 0; index < distributedPages.length && pageDiff > 0; index += 1) {
        distributedPages[index] += 1;
        pageDiff -= 1;
      }
    } else {
      for (let index = distributedPages.length - 1; index >= 0 && pageDiff < 0; index -= 1) {
        if (distributedPages[index] > 1) {
          distributedPages[index] -= 1;
          pageDiff += 1;
        }
      }
      if (!distributedPages.some((pageCount) => pageCount > 1)) {
        break;
      }
    }
  }

  const normalizedChapters = flat.map((chapter, index) => {
    const targetPages = distributedPages[index] || 1;
    const proportionalWords = (rawWeights[index] / weightSum) * totalTargetWords;
    const targetWords = Math.max(250, Math.round((proportionalWords || targetPages * 275) / 25) * 25);
    return {
      ...chapter,
      targetPages,
      targetWords,
    };
  });

  let chapterIndex = 0;
  const nextParts = (architecture.parts || []).map((part) => ({
    ...part,
    chapters: (part.chapters || []).map((chapter) => {
      const normalized = normalizedChapters[chapterIndex];
      chapterIndex += 1;
      if (!normalized) return chapter;
      return {
        ...chapter,
        chapterNumber: normalized.chapterNumber,
        title: normalized.title,
        targetPages: normalized.targetPages,
        targetWords: normalized.targetWords,
      };
    }),
  }));

  return {
    ...architecture,
    parts: nextParts,
  };
}
