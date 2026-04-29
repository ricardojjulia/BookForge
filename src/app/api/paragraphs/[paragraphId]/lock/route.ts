import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  locked: z.boolean(),
  reason: z.string().max(500).optional(),
});

type ParagraphRow = {
  id: string;
  book_id: string;
  chapter_id: string;
  scene_id: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to update passage lock.";
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
      .select("id,book_id,chapter_id,scene_id")
      .eq("id", paragraphId)
      .single();
    if (paragraphError) throw paragraphError;

    const row = paragraph as ParagraphRow;
    const { error: updateError } = await supabase
      .from("paragraphs")
      .update({ is_locked: body.locked, updated_at: new Date().toISOString() })
      .eq("id", paragraphId);
    if (updateError) throw updateError;

    if (body.locked) {
      await supabase.from("locked_passages").delete().eq("paragraph_id", paragraphId);
      const { error: insertError } = await supabase.from("locked_passages").insert({
        book_id: row.book_id,
        chapter_id: row.chapter_id,
        scene_id: row.scene_id,
        paragraph_id: row.id,
        reason: body.reason?.trim() || "Protected by author.",
      });
      if (insertError) throw insertError;
    } else {
      const { error: deleteError } = await supabase.from("locked_passages").delete().eq("paragraph_id", paragraphId);
      if (deleteError) throw deleteError;
    }

    return NextResponse.json({ content: { paragraphId, locked: body.locked } });
  } catch (error) {
    console.error("Passage lock update failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
