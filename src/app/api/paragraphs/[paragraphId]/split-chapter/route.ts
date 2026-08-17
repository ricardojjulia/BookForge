import { NextResponse } from "next/server";
import { z } from "zod";
import { renumberChapters } from "@/lib/manuscript/renumber-chapters";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  title: z.string().min(1).max(200),
});

type ParagraphRow = {
  id: string;
  book_id: string;
  chapter_id: string;
  scene_id: string | null;
  paragraph_number: number;
  original_text: string;
};

type ChapterRow = {
  id: string;
  book_id: string;
  chapter_number: number;
  title: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to split chapter.";
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

    const { data: paragraph, error: paragraphError } = await supabase
      .from("paragraphs")
      .select("id,book_id,chapter_id,scene_id,paragraph_number,original_text")
      .eq("id", paragraphId)
      .single();
    if (paragraphError) throw paragraphError;
    const start = paragraph as ParagraphRow;

    const { data: chapter, error: chapterError } = await supabase
      .from("chapters")
      .select("id,book_id,chapter_number,title")
      .eq("id", start.chapter_id)
      .single();
    if (chapterError) throw chapterError;
    const sourceChapter = chapter as ChapterRow;

    const { data: sourceParagraphs, error: sourceParagraphsError } = await supabase
      .from("paragraphs")
      .select("id,book_id,chapter_id,scene_id,paragraph_number,original_text")
      .eq("chapter_id", sourceChapter.id)
      .order("paragraph_number");
    if (sourceParagraphsError) throw sourceParagraphsError;

    const allSourceParagraphs = (sourceParagraphs || []) as ParagraphRow[];
    const movingParagraphs = allSourceParagraphs.filter((item) => item.paragraph_number >= start.paragraph_number);
    const remainingParagraphs = allSourceParagraphs.filter((item) => item.paragraph_number < start.paragraph_number);
    if (!remainingParagraphs.length || !movingParagraphs.length) {
      return NextResponse.json(
        { error: "Choose a paragraph after the first paragraph so both chapters keep body text." },
        { status: 400 },
      );
    }

    const newChapterNumber = sourceChapter.chapter_number + 1;
    const { data: laterChapters, error: laterError } = await supabase
      .from("chapters")
      .select("id,chapter_number")
      .eq("book_id", sourceChapter.book_id)
      .gte("chapter_number", newChapterNumber)
      .order("chapter_number", { ascending: false });
    if (laterError) throw laterError;

    for (const later of laterChapters || []) {
      const { error } = await supabase
        .from("chapters")
        .update({ chapter_number: later.chapter_number + 1, updated_at: new Date().toISOString() })
        .eq("id", later.id);
      if (error) throw error;
    }

    const now = new Date().toISOString();
    const newChapterText = movingParagraphs.map((item) => item.original_text).join("\n\n");
    const { data: newChapter, error: createError } = await supabase
      .from("chapters")
      .insert({
        book_id: sourceChapter.book_id,
        chapter_number: newChapterNumber,
        title: body.title.trim(),
        original_text: newChapterText,
        current_text: newChapterText,
        accepted_text: null,
        summary: null,
        status: "pending",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (createError) throw createError;

    const { data: newScene, error: sceneError } = await supabase
      .from("scenes")
      .insert({
        book_id: sourceChapter.book_id,
        chapter_id: newChapter.id,
        scene_number: 1,
        original_text: newChapterText,
        current_text: newChapterText,
        accepted_text: null,
        summary: null,
        status: "pending",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (sceneError) throw sceneError;

    for (const [index, item] of movingParagraphs.entries()) {
      const { error } = await supabase
        .from("paragraphs")
        .update({
          chapter_id: newChapter.id,
          scene_id: newScene.id,
          paragraph_number: index + 1,
          updated_at: now,
        })
        .eq("id", item.id);
      if (error) throw error;
    }

    for (const [index, item] of remainingParagraphs.entries()) {
      const { error } = await supabase
        .from("paragraphs")
        .update({ paragraph_number: index + 1, updated_at: now })
        .eq("id", item.id);
      if (error) throw error;
    }

    const remainingText = remainingParagraphs.map((item) => item.original_text).join("\n\n");
    const movingIds = movingParagraphs.map((item) => item.id);
    const { error: sourceUpdateError } = await supabase
      .from("chapters")
      .update({
        original_text: remainingText,
        current_text: remainingText,
        accepted_text: null,
        summary: null,
        status: "pending",
        updated_at: now,
      })
      .eq("id", sourceChapter.id);
    if (sourceUpdateError) throw sourceUpdateError;

    const { error: revisionUpdateError } = await supabase
      .from("revision_versions")
      .update({ chapter_id: newChapter.id, scene_id: newScene.id })
      .in("paragraph_id", movingIds);
    if (revisionUpdateError) throw revisionUpdateError;

    const { error: lockUpdateError } = await supabase
      .from("locked_passages")
      .update({ chapter_id: newChapter.id, scene_id: newScene.id })
      .in("paragraph_id", movingIds);
    if (lockUpdateError) throw lockUpdateError;

    // Chapter numbers are already correct at this point (the shift-up loop
    // above plus inserting the new chapter at the vacated number), so this
    // is purely a title-sync pass: any shifted chapter whose title was a
    // generic "Chapter N" placeholder needs it updated to match its new
    // number, exactly like merge-next/DELETE already do -- this call site
    // previously had its own bare renumbering loop that never synced titles,
    // reintroducing that same bug for a chapter split.
    await renumberChapters(supabase, sourceChapter.book_id);

    return NextResponse.json({ content: { split: true, newChapterId: newChapter.id } });
  } catch (error) {
    console.error("Chapter split failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
