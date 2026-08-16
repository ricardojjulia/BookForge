import { NextResponse } from "next/server";
import { renumberChapters } from "@/lib/manuscript/renumber-chapters";
import { createClient } from "@/lib/supabase/server";

type ChapterRow = {
  id: string;
  book_id: string;
  chapter_number: number;
  title: string | null;
  original_text: string;
  current_text: string | null;
  accepted_text: string | null;
};

type ParagraphRow = {
  id: string;
  paragraph_number: number;
};

type SceneRow = {
  id: string;
  scene_number: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to merge chapter.";
}

export async function PATCH(_: Request, context: { params: Promise<{ chapterId: string }> }) {
  try {
    const { chapterId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: chapter, error: chapterError } = await supabase
      .from("chapters")
      .select("id,book_id,chapter_number,title,original_text,current_text,accepted_text")
      .eq("id", chapterId)
      .single();
    if (chapterError) throw chapterError;
    const current = chapter as ChapterRow;

    const { data: nextChapter, error: nextError } = await supabase
      .from("chapters")
      .select("id,book_id,chapter_number,title,original_text,current_text,accepted_text")
      .eq("book_id", current.book_id)
      .gt("chapter_number", current.chapter_number)
      .order("chapter_number")
      .limit(1)
      .maybeSingle();
    if (nextError) throw nextError;
    if (!nextChapter) return NextResponse.json({ error: "No next chapter to merge." }, { status: 400 });
    const next = nextChapter as ChapterRow;

    const [{ data: currentParagraphs }, { data: nextParagraphs }, { data: currentScenes }, { data: nextScenes }] =
      await Promise.all([
        supabase.from("paragraphs").select("id,paragraph_number").eq("chapter_id", current.id).order("paragraph_number"),
        supabase.from("paragraphs").select("id,paragraph_number").eq("chapter_id", next.id).order("paragraph_number"),
        supabase.from("scenes").select("id,scene_number").eq("chapter_id", current.id).order("scene_number"),
        supabase.from("scenes").select("id,scene_number").eq("chapter_id", next.id).order("scene_number"),
      ]);

    const currentParagraphCount = (currentParagraphs || []).length;
    const currentSceneCount = (currentScenes || []).length;
    const now = new Date().toISOString();

    for (const [index, paragraph] of ((nextParagraphs || []) as ParagraphRow[]).entries()) {
      const { error } = await supabase
        .from("paragraphs")
        .update({
          chapter_id: current.id,
          paragraph_number: currentParagraphCount + index + 1,
          updated_at: now,
        })
        .eq("id", paragraph.id);
      if (error) throw error;
    }

    for (const [index, scene] of ((nextScenes || []) as SceneRow[]).entries()) {
      const { error } = await supabase
        .from("scenes")
        .update({
          chapter_id: current.id,
          scene_number: currentSceneCount + index + 1,
          updated_at: now,
        })
        .eq("id", scene.id);
      if (error) throw error;
    }

    const nextParagraphIds = ((nextParagraphs || []) as ParagraphRow[]).map((paragraph) => paragraph.id);
    if (nextParagraphIds.length) {
      const { error: revisionError } = await supabase
        .from("revision_versions")
        .update({ chapter_id: current.id })
        .in("paragraph_id", nextParagraphIds);
      if (revisionError) throw revisionError;

      const { error: locksError } = await supabase
        .from("locked_passages")
        .update({ chapter_id: current.id })
        .in("paragraph_id", nextParagraphIds);
      if (locksError) throw locksError;
    }

    const mergedOriginal = mergeText(current.original_text, next.original_text);
    const mergedCurrent = mergeText(current.current_text, next.current_text) || mergedOriginal;
    const mergedAccepted = mergeText(current.accepted_text, next.accepted_text) || null;
    const { error: updateCurrentError } = await supabase
      .from("chapters")
      .update({
        original_text: mergedOriginal,
        current_text: mergedCurrent,
        accepted_text: mergedAccepted,
        summary: null,
        status: "pending",
        updated_at: now,
      })
      .eq("id", current.id);
    if (updateCurrentError) throw updateCurrentError;

    const { error: deleteNextError } = await supabase.from("chapters").delete().eq("id", next.id);
    if (deleteNextError) throw deleteNextError;

    await renumberChapters(supabase, current.book_id);

    return NextResponse.json({ content: { merged: true, chapterId: current.id } });
  } catch (error) {
    console.error("Chapter merge failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function mergeText(first: string | null, second: string | null) {
  if (!first && !second) return "";
  return `${(first || "").trim()}\n\n${(second || "").trim()}`.trim();
}
