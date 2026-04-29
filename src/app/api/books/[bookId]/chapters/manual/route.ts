import { NextResponse } from "next/server";
import { z } from "zod";
import { parseManuscript } from "@/lib/manuscript/parser";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
});

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { count, error: countError } = await supabase
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId);

    if (countError) throw countError;

    const chapterNumber = (count || 0) + 1;
    const parsed = parseManuscript(body.text, body.title);
    const sceneSource = parsed.chapters[0]?.scenes || [];

    const { data: chapter, error: chapterError } = await supabase
      .from("chapters")
      .insert({
        book_id: bookId,
        chapter_number: chapterNumber,
        title: body.title,
        original_text: body.text,
        current_text: body.text,
        status: "manual",
      })
      .select("id")
      .single();

    if (chapterError) throw chapterError;

    for (const scene of sceneSource) {
      const { data: sceneRow, error: sceneError } = await supabase
        .from("scenes")
        .insert({
          book_id: bookId,
          chapter_id: chapter.id,
          scene_number: scene.sceneNumber,
          original_text: scene.text,
          current_text: scene.text,
          status: "manual",
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

      if (paragraphRows.length) {
        const { error: paragraphError } = await supabase.from("paragraphs").insert(paragraphRows);
        if (paragraphError) throw paragraphError;
      }
    }

    return NextResponse.json({ chapterId: chapter.id, chapterNumber });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add chapter." },
      { status: 500 },
    );
  }
}
