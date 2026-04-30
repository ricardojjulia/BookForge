import { NextResponse } from "next/server";
import { buildCreationDraftChapterPrompt } from "@/lib/creation/draft-prompt";
import { createLmStudioClient, testLmStudioConnection } from "@/lib/lmstudio/client";
import { getLmStudioErrorMessage } from "@/lib/lmstudio/errors";
import { parseModelJsonOrFallback } from "@/lib/lmstudio/json";
import { getDraftModelCandidates, selectLoadedLmStudioModel } from "@/lib/lmstudio/model-selection";
import { getUserLmStudioSettings } from "@/lib/lmstudio/settings";
import { parseChapterScenes } from "@/lib/manuscript/parser";
import { createClient } from "@/lib/supabase/server";

type ArchitectureChapter = {
  chapterNumber?: number;
  title?: string;
  purpose?: string;
  targetWords?: number;
  targetPages?: number;
  emotionalMovement?: string;
  keyBeats?: unknown[];
  charactersOrConcepts?: unknown[];
  continuityNotes?: unknown[];
  riskNotes?: unknown[];
  partTitle?: string;
};

function getErrorMessage(error: unknown, context: { model?: string; task?: string; modelSource?: string; configuredModels?: string[] } = {}) {
  const lmStudioMessage = getLmStudioErrorMessage(error, "", context);
  if (lmStudioMessage) return lmStudioMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Draft generation failed.";
}

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = await request.json().catch(() => ({}));
    const requestedLimit = Number(body?.limit || 3);
    const limit = Math.max(1, Math.min(5, Number.isFinite(requestedLimit) ? requestedLimit : 3));

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id,title,genre,target_audience,owner_id")
      .eq("id", bookId)
      .single();
    if (bookError) throw bookError;

    const { data: creationProject, error: creationError } = await supabase
      .from("creation_projects")
      .select("*")
      .eq("created_book_id", bookId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (creationError) throw creationError;

    if (!creationProject) {
      return NextResponse.json(
        { error: "This book was not created from a BookForge Creator architecture." },
        { status: 400 },
      );
    }

    const { data: plans, error: plansError } = await supabase
      .from("creation_plan_versions")
      .select("version_type,content,created_at,accepted")
      .eq("creation_project_id", creationProject.id)
      .in("version_type", ["concept", "architecture"])
      .order("created_at", { ascending: false });
    if (plansError) throw plansError;

    const concept = plans?.find((plan) => plan.version_type === "concept" && plan.accepted)?.content || {};
    const architecture = plans?.find((plan) => plan.version_type === "architecture" && plan.accepted)?.content;
    if (!architecture) {
      return NextResponse.json({ error: "No accepted architecture found for this generated book." }, { status: 400 });
    }

    const architectureChapters = flattenArchitectureChapters(architecture);
    const { data: chapters, error: chaptersError } = await supabase
      .from("chapters")
      .select("id,chapter_number,title,summary,status,original_text")
      .eq("book_id", bookId)
      .order("chapter_number");
    if (chaptersError) throw chaptersError;

    const plannedChapters = (chapters || [])
      .filter((chapter) => chapter.status === "planned" || isPlaceholderText(chapter.original_text || ""))
      .slice(0, limit);

    if (!plannedChapters.length) {
      return NextResponse.json({
        content: {
          generated: 0,
          remaining: 0,
          message: "No planned chapter shells need draft generation.",
        },
      });
    }

    const settings = await getUserLmStudioSettings(user.id);
    const client = createLmStudioClient(settings);
    const modelSelection = selectLoadedLmStudioModel({
      candidates: getDraftModelCandidates(settings),
      availableModels: await getAvailableModels(settings.baseUrl),
    });
    const model = modelSelection.model;
    const generated: Array<{ chapterNumber: number; title: string | null; paragraphCount: number }> = [];

    const { data: job, error: jobError } = await supabase
      .from("revision_jobs")
      .insert({
        book_id: bookId,
        mode: "creation_draft_generation",
        status: "running",
        settings: {
          limit,
          model,
          modelSource: modelSelection.source,
          configuredModelFallbackOrder: modelSelection.configuredModels,
          availableModels: modelSelection.availableModels,
          usedLoadedFallback: modelSelection.usedLoadedFallback,
          generationKind: "planned_chapter_draft",
        },
        created_by: user.id,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (jobError) throw jobError;

    try {
      for (const chapter of plannedChapters) {
        const architectureChapter =
          architectureChapters.find((item) => item.chapterNumber === chapter.chapter_number) || {
            chapterNumber: chapter.chapter_number,
            title: chapter.title || `Chapter ${chapter.chapter_number}`,
            purpose: chapter.summary || "",
          };
        const previousChapter = architectureChapters.find((item) => item.chapterNumber === chapter.chapter_number - 1);
        const nextChapter = architectureChapters.find((item) => item.chapterNumber === chapter.chapter_number + 1);
        const prompt = buildCreationDraftChapterPrompt({
          workingTitle: creationProject.working_title || book.title,
          genre: creationProject.genre || book.genre || "Unspecified",
          targetAudience: creationProject.target_audience || book.target_audience || "Unspecified",
          language: creationProject.language || "English",
          targetPages: Number(creationProject.target_pages || 120),
          tone: creationProject.tone || "",
          boundaries: creationProject.boundaries || "",
          concept,
          architecture,
          chapter: architectureChapter,
          previousChapterSummary: summarizeArchitectureChapter(previousChapter),
          nextChapterSummary: summarizeArchitectureChapter(nextChapter),
        });

        const completion = await client.chat.completions
          .create({
            model,
            temperature: Math.min(Math.max(settings.temperature, 0.45), 0.8),
            top_p: settings.topP,
            max_tokens: Math.min(Math.max(settings.maxOutputTokens, 2048), 6000),
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "text" },
          })
          .catch((error) => {
            throw new Error(
              `Chapter ${chapter.chapter_number}: ${chapter.title || "Untitled"}: ${getErrorMessage(error, {
                model,
                task: "Generate Planned Draft",
                modelSource: modelSelection.source,
                configuredModels: modelSelection.configuredModels,
              })}`,
            );
          });

        const parsed = parseModelJsonOrFallback(completion.choices[0]?.message.content || "", (raw) => ({
          chapterText: raw,
          chapterSummary: "",
          continuityNotes: [],
          generationNotes: ["The model returned prose instead of JSON; BookForge preserved it as chapter text."],
        })) as {
          chapterText?: unknown;
          chapterSummary?: unknown;
          continuityNotes?: unknown;
          generationNotes?: unknown;
        };

        const chapterText = cleanGeneratedChapterText(String(parsed.chapterText || ""), chapter.title || "");
        if (chapterText.split(/\s+/).filter(Boolean).length < 80) {
          throw new Error(`Chapter ${chapter.chapter_number} generation returned too little text.`);
        }

        await supabase.from("paragraphs").delete().eq("chapter_id", chapter.id);
        await supabase.from("scenes").delete().eq("chapter_id", chapter.id);

        const { error: chapterUpdateError } = await supabase
          .from("chapters")
          .update({
            original_text: chapterText,
            current_text: chapterText,
            summary: String(parsed.chapterSummary || chapter.summary || architectureChapter.purpose || ""),
            status: "draft",
            updated_at: new Date().toISOString(),
          })
          .eq("id", chapter.id);
        if (chapterUpdateError) throw chapterUpdateError;

        const scenes = parseChapterScenes(chapterText);
        let paragraphCount = 0;
        for (const scene of scenes) {
          const { data: sceneRow, error: sceneError } = await supabase
            .from("scenes")
            .insert({
              book_id: bookId,
              chapter_id: chapter.id,
              scene_number: scene.sceneNumber,
              original_text: scene.text,
              current_text: scene.text,
              status: "draft",
            })
            .select("id")
            .single();
          if (sceneError) throw sceneError;

          const paragraphRows = scene.paragraphs.map((paragraph) => ({
            book_id: bookId,
            chapter_id: chapter.id,
            scene_id: sceneRow.id,
            paragraph_number: paragraph.paragraphNumber,
            original_text: paragraph.text,
            current_text: paragraph.text,
          }));
          paragraphCount += paragraphRows.length;
          if (paragraphRows.length) {
            const { error: paragraphError } = await supabase.from("paragraphs").insert(paragraphRows);
            if (paragraphError) throw paragraphError;
          }
        }

        await supabase.from("coherence_reports").insert({
          book_id: bookId,
          chapter_id: chapter.id,
          report_type: "creation_draft_generation",
          content: {
            chapterNumber: chapter.chapter_number,
            model,
            promptSnapshot: prompt,
            continuityNotes: parsed.continuityNotes || [],
            generationNotes: parsed.generationNotes || [],
          },
        });

        generated.push({
          chapterNumber: chapter.chapter_number,
          title: chapter.title,
          paragraphCount,
        });
      }

      const remaining = Math.max(0, (chapters || []).filter((chapter) => chapter.status === "planned").length - generated.length);
      await supabase
        .from("revision_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          settings: {
            limit,
            model,
            modelSource: modelSelection.source,
            configuredModelFallbackOrder: modelSelection.configuredModels,
            generationKind: "planned_chapter_draft",
            generated,
            remaining,
          },
        })
        .eq("id", job.id);

      await supabase
        .from("creation_projects")
        .update({
          status: remaining > 0 ? "generating" : "created",
          updated_at: new Date().toISOString(),
          metadata: {
            ...(typeof creationProject.metadata === "object" && creationProject.metadata ? creationProject.metadata : {}),
            lastDraftGenerationAt: new Date().toISOString(),
            generatedChapterCount: ((chapters || []).length - remaining),
          },
        })
        .eq("id", creationProject.id);

      await supabase
        .from("books")
        .update({
          status: remaining > 0 ? "generating" : "created",
          updated_at: new Date().toISOString(),
        })
        .eq("id", bookId)
        .in("status", ["planned", "draft", "generating"]);

      return NextResponse.json({
        content: {
          generated: generated.length,
          remaining,
          chapters: generated,
        },
      });
    } catch (error) {
      await supabase
        .from("revision_jobs")
        .update({
          status: "failed",
          error_message: getErrorMessage(error, {
            model,
            task: "Generate Planned Draft",
            modelSource: modelSelection.source,
            configuredModels: modelSelection.configuredModels,
          }),
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      throw error;
    }
  } catch (error) {
    console.error("Creation draft generation failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function getAvailableModels(baseUrl: string) {
  try {
    return (await testLmStudioConnection({ baseUrl })).models;
  } catch {
    return [];
  }
}

function flattenArchitectureChapters(architecture: unknown): ArchitectureChapter[] {
  if (!architecture || typeof architecture !== "object") return [];
  const parts = Array.isArray((architecture as { parts?: unknown }).parts)
    ? ((architecture as { parts: unknown[] }).parts)
    : [];
  return parts
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const partTitle = typeof (part as { title?: unknown }).title === "string" ? (part as { title: string }).title : "";
      const chapters = Array.isArray((part as { chapters?: unknown }).chapters)
        ? (part as { chapters: unknown[] }).chapters
        : [];
      return chapters.map((chapter) => ({
        ...((chapter && typeof chapter === "object" ? chapter : {}) as ArchitectureChapter),
        partTitle,
      }));
    })
    .map((chapter, index) => ({
      ...chapter,
      chapterNumber: Number(chapter.chapterNumber || index + 1),
    }));
}

function summarizeArchitectureChapter(chapter?: ArchitectureChapter) {
  if (!chapter) return "";
  return [
    chapter.title ? `Title: ${chapter.title}` : "",
    chapter.purpose ? `Purpose: ${chapter.purpose}` : "",
    chapter.emotionalMovement ? `Emotional movement: ${chapter.emotionalMovement}` : "",
    chapter.continuityNotes?.length ? `Continuity notes: ${JSON.stringify(chapter.continuityNotes)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function isPlaceholderText(text: string) {
  return /Draft text has not been generated yet\. This planned chapter shell was created from BookForge Creator architecture\./i.test(
    text,
  );
}

function cleanGeneratedChapterText(text: string, title: string) {
  const cleaned = text
    .replace(/^```(?:json|markdown|text)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (!title) return cleaned;
  const lines = cleaned.split("\n");
  const first = lines[0]?.trim().replace(/^#+\s*/, "");
  if (first && first.toLowerCase() === title.trim().toLowerCase()) {
    return lines.slice(1).join("\n").trim();
  }
  return cleaned;
}
