import { NextResponse } from "next/server";
import { z } from "zod";
import { refreshChapterScenes } from "@/lib/structure/scenes";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  title: z.string().max(160).optional(),
});

type ParagraphRow = {
  id: string;
  book_id: string;
  chapter_id: string;
  scene_id: string | null;
  paragraph_number: number;
  original_text: string;
  current_text: string | null;
  accepted_text: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to create scene.";
}

export async function PATCH(request: Request, context: { params: Promise<{ paragraphId: string }> }) {
  try {
    const { paragraphId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: startParagraph, error: startError } = await supabase
      .from("paragraphs")
      .select("id,book_id,chapter_id,scene_id,paragraph_number,original_text,current_text,accepted_text")
      .eq("id", paragraphId)
      .single();
    if (startError) throw startError;
    const start = startParagraph as ParagraphRow;

    const { data: chapterParagraphs, error: paragraphsError } = await supabase
      .from("paragraphs")
      .select("id,book_id,chapter_id,scene_id,paragraph_number,original_text,current_text,accepted_text")
      .eq("chapter_id", start.chapter_id)
      .order("paragraph_number");
    if (paragraphsError) throw paragraphsError;

    const paragraphs = (chapterParagraphs || []) as ParagraphRow[];
    const startIndex = paragraphs.findIndex((paragraph) => paragraph.id === start.id);
    if (startIndex < 0) return NextResponse.json({ error: "Paragraph not found in chapter." }, { status: 404 });

    const sourceSceneId = start.scene_id;
    const boundaryIndex = paragraphs.findIndex(
      (paragraph, index) => index > startIndex && paragraph.scene_id !== sourceSceneId && Boolean(paragraph.scene_id),
    );
    const movingParagraphs = paragraphs.slice(startIndex, boundaryIndex > -1 ? boundaryIndex : paragraphs.length);
    if (movingParagraphs.length === paragraphs.length) {
      return NextResponse.json(
        { error: "Choose a later paragraph so the chapter can be divided into separate scenes." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const originalText = movingParagraphs.map((paragraph) => paragraph.original_text).join("\n\n");
    const currentText = movingParagraphs.map((paragraph) => paragraph.current_text || paragraph.original_text).join("\n\n");
    const { data: scene, error: sceneError } = await supabase
      .from("scenes")
      .insert({
        book_id: start.book_id,
        chapter_id: start.chapter_id,
        scene_number: 9999,
        title: body.title?.trim() || null,
        original_text: originalText,
        current_text: currentText,
        accepted_text: null,
        summary: null,
        status: "pending",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (sceneError) throw sceneError;

    const movingIds = movingParagraphs.map((paragraph) => paragraph.id);
    const { error: paragraphUpdateError } = await supabase
      .from("paragraphs")
      .update({ scene_id: scene.id, updated_at: now })
      .in("id", movingIds);
    if (paragraphUpdateError) throw paragraphUpdateError;

    const { error: revisionError } = await supabase
      .from("revision_versions")
      .update({ scene_id: scene.id })
      .in("paragraph_id", movingIds);
    if (revisionError) throw revisionError;

    const { error: locksError } = await supabase
      .from("locked_passages")
      .update({ scene_id: scene.id })
      .in("paragraph_id", movingIds);
    if (locksError) throw locksError;

    await refreshChapterScenes(supabase, start.chapter_id);
    return NextResponse.json({ content: { created: true, sceneId: scene.id } });
  } catch (error) {
    console.error("Scene creation failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
