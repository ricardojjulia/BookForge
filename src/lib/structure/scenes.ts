import type { SupabaseClient } from "@supabase/supabase-js";

type SceneParagraph = {
  scene_id: string | null;
  paragraph_number: number;
  original_text: string;
  current_text: string | null;
  accepted_text: string | null;
};

type SceneRow = {
  id: string;
  scene_number: number;
};

/** Thrown for expected, user-facing failures (e.g. "that paragraph starts the whole chapter") so callers can map it to a 400 instead of a 500. */
export class SceneSplitError extends Error {}

type SplitParagraphRow = {
  id: string;
  book_id: string;
  chapter_id: string;
  scene_id: string | null;
  paragraph_number: number;
  original_text: string;
  current_text: string | null;
  accepted_text: string | null;
};

/**
 * Moves a paragraph and every following paragraph up to the next existing
 * scene boundary into a brand-new scene. Shared by the manual "Start scene
 * here" action (scene-start route) and AI scene-split-suggestion approval,
 * so both apply splits through the exact same mutation.
 */
export async function applySceneSplit(
  supabase: SupabaseClient,
  { paragraphId, title }: { paragraphId: string; title?: string | null },
): Promise<{ sceneId: string }> {
  const { data: startParagraph, error: startError } = await supabase
    .from("paragraphs")
    .select("id,book_id,chapter_id,scene_id,paragraph_number,original_text,current_text,accepted_text")
    .eq("id", paragraphId)
    .single();
  if (startError) throw startError;
  const start = startParagraph as SplitParagraphRow;

  const { data: chapterParagraphs, error: paragraphsError } = await supabase
    .from("paragraphs")
    .select("id,book_id,chapter_id,scene_id,paragraph_number,original_text,current_text,accepted_text")
    .eq("chapter_id", start.chapter_id)
    .order("paragraph_number");
  if (paragraphsError) throw paragraphsError;

  const paragraphs = (chapterParagraphs || []) as SplitParagraphRow[];
  const startIndex = paragraphs.findIndex((paragraph) => paragraph.id === start.id);
  if (startIndex < 0) throw new SceneSplitError("Paragraph not found in chapter.");

  const sourceSceneId = start.scene_id;
  const boundaryIndex = paragraphs.findIndex(
    (paragraph, index) => index > startIndex && paragraph.scene_id !== sourceSceneId && Boolean(paragraph.scene_id),
  );
  const movingParagraphs = paragraphs.slice(startIndex, boundaryIndex > -1 ? boundaryIndex : paragraphs.length);
  if (movingParagraphs.length === paragraphs.length) {
    throw new SceneSplitError("Choose a later paragraph so the chapter can be divided into separate scenes.");
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
      title: title?.trim() || null,
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
  return { sceneId: scene.id };
}

export async function refreshChapterScenes(supabase: SupabaseClient, chapterId: string) {
  const [{ data: scenes, error: scenesError }, { data: paragraphs, error: paragraphsError }] = await Promise.all([
    supabase.from("scenes").select("id,scene_number").eq("chapter_id", chapterId).order("scene_number"),
    supabase
      .from("paragraphs")
      .select("scene_id,paragraph_number,original_text,current_text,accepted_text")
      .eq("chapter_id", chapterId)
      .order("paragraph_number"),
  ]);
  if (scenesError) throw scenesError;
  if (paragraphsError) throw paragraphsError;

  const rows = (paragraphs || []) as SceneParagraph[];
  const sceneRows = (scenes || []) as SceneRow[];
  const sceneIdsInReadingOrder = Array.from(
    new Set(rows.map((paragraph) => paragraph.scene_id).filter((sceneId): sceneId is string => Boolean(sceneId))),
  );
  const trailingEmptySceneIds = sceneRows
    .map((scene) => scene.id)
    .filter((sceneId) => !sceneIdsInReadingOrder.includes(sceneId));
  const orderedSceneIds = [...sceneIdsInReadingOrder, ...trailingEmptySceneIds];
  const now = new Date().toISOString();

  for (const [index, sceneId] of orderedSceneIds.entries()) {
    const sceneParagraphs = rows.filter((paragraph) => paragraph.scene_id === sceneId);
    const originalText = sceneParagraphs.map((paragraph) => paragraph.original_text).join("\n\n");
    const currentText = sceneParagraphs.map((paragraph) => paragraph.current_text || paragraph.original_text).join("\n\n");
    const acceptedParagraphs = sceneParagraphs.map((paragraph) => paragraph.accepted_text).filter(Boolean);
    const acceptedText =
      acceptedParagraphs.length === sceneParagraphs.length && sceneParagraphs.length > 0
        ? acceptedParagraphs.join("\n\n")
        : null;

    const { error } = await supabase
      .from("scenes")
      .update({
        scene_number: index + 1,
        original_text: originalText,
        current_text: currentText || originalText,
        accepted_text: acceptedText,
        summary: null,
        status: "pending",
        updated_at: now,
      })
      .eq("id", sceneId);
    if (error) throw error;
  }
}
