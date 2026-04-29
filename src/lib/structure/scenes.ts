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
