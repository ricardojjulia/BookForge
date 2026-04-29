import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  firstText: z.string().min(1),
  secondText: z.string().min(1),
});

type ParagraphRow = {
  id: string;
  book_id: string;
  chapter_id: string;
  scene_id: string | null;
  paragraph_number: number;
  is_locked: boolean | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to split paragraph.";
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
      .select("id,book_id,chapter_id,scene_id,paragraph_number,is_locked")
      .eq("id", paragraphId)
      .single();
    if (paragraphError) throw paragraphError;

    const row = paragraph as ParagraphRow;
    const { data: following, error: followingError } = await supabase
      .from("paragraphs")
      .select("id,paragraph_number")
      .eq("chapter_id", row.chapter_id)
      .gt("paragraph_number", row.paragraph_number)
      .order("paragraph_number", { ascending: false });
    if (followingError) throw followingError;

    for (const item of following || []) {
      const { error } = await supabase
        .from("paragraphs")
        .update({ paragraph_number: item.paragraph_number + 1 })
        .eq("id", item.id);
      if (error) throw error;
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("paragraphs")
      .update({
        original_text: body.firstText.trim(),
        current_text: body.firstText.trim(),
        accepted_text: null,
        updated_at: now,
      })
      .eq("id", row.id);
    if (updateError) throw updateError;

    const { error: insertError } = await supabase.from("paragraphs").insert({
      book_id: row.book_id,
      chapter_id: row.chapter_id,
      scene_id: row.scene_id,
      paragraph_number: row.paragraph_number + 1,
      original_text: body.secondText.trim(),
      current_text: body.secondText.trim(),
      accepted_text: null,
      is_locked: row.is_locked,
      created_at: now,
      updated_at: now,
    });
    if (insertError) throw insertError;

    return NextResponse.json({ content: { split: true } });
  } catch (error) {
    console.error("Paragraph split failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
