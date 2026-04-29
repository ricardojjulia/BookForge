import { NextResponse } from "next/server";
import { refreshChapterScenes } from "@/lib/structure/scenes";
import { createClient } from "@/lib/supabase/server";

type SceneRow = {
  id: string;
  book_id: string;
  chapter_id: string;
  scene_number: number;
  original_text: string;
  current_text: string | null;
  accepted_text: string | null;
};

type ParagraphRow = {
  id: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to merge scenes.";
}

export async function PATCH(_: Request, context: { params: Promise<{ sceneId: string }> }) {
  try {
    const { sceneId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: scene, error: sceneError } = await supabase
      .from("scenes")
      .select("id,book_id,chapter_id,scene_number,original_text,current_text,accepted_text")
      .eq("id", sceneId)
      .single();
    if (sceneError) throw sceneError;
    const current = scene as SceneRow;

    const { data: nextScene, error: nextError } = await supabase
      .from("scenes")
      .select("id,book_id,chapter_id,scene_number,original_text,current_text,accepted_text")
      .eq("chapter_id", current.chapter_id)
      .gt("scene_number", current.scene_number)
      .order("scene_number")
      .limit(1)
      .maybeSingle();
    if (nextError) throw nextError;
    if (!nextScene) return NextResponse.json({ error: "No next scene to merge." }, { status: 400 });
    const next = nextScene as SceneRow;

    const { data: nextParagraphs, error: paragraphError } = await supabase
      .from("paragraphs")
      .select("id")
      .eq("scene_id", next.id);
    if (paragraphError) throw paragraphError;
    const movedParagraphIds = ((nextParagraphs || []) as ParagraphRow[]).map((paragraph) => paragraph.id);
    const now = new Date().toISOString();

    if (movedParagraphIds.length) {
      const { error: paragraphUpdateError } = await supabase
        .from("paragraphs")
        .update({ scene_id: current.id, updated_at: now })
        .in("id", movedParagraphIds);
      if (paragraphUpdateError) throw paragraphUpdateError;

      const { error: revisionError } = await supabase
        .from("revision_versions")
        .update({ scene_id: current.id })
        .in("paragraph_id", movedParagraphIds);
      if (revisionError) throw revisionError;

      const { error: locksError } = await supabase
        .from("locked_passages")
        .update({ scene_id: current.id })
        .in("paragraph_id", movedParagraphIds);
      if (locksError) throw locksError;
    }

    const { error: deleteError } = await supabase.from("scenes").delete().eq("id", next.id);
    if (deleteError) throw deleteError;

    await refreshChapterScenes(supabase, current.chapter_id);
    return NextResponse.json({ content: { merged: true, sceneId: current.id } });
  } catch (error) {
    console.error("Scene merge failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
