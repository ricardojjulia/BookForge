import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const chapterSchema = z.object({
  chapterNumber: z.number().int().positive().optional(),
  title: z.string().optional(),
  purpose: z.string().optional(),
  targetWords: z.number().int().nonnegative().optional(),
  targetPages: z.number().nonnegative().optional(),
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
        partNumber: z.number().int().positive().optional(),
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

    const chapters = flattenArchitectureChapters(body.architecture);
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
      content: body.architecture,
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

    const { data: book, error: bookError } = await supabase
      .from("books")
      .insert({
        project_id: projectRow.id,
        owner_id: user.id,
        title: project.working_title,
        author_name: "",
        genre: project.genre,
        target_audience: project.target_audience,
        status: "draft",
      })
      .select("id")
      .single();
    if (bookError) throw bookError;

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
