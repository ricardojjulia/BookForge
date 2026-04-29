import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ParagraphRow = {
  id: string;
  book_id: string;
  chapter_id: string;
  scene_id: string | null;
  paragraph_number: number;
  original_text: string;
  current_text: string | null;
  accepted_text: string | null;
  is_locked: boolean | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to merge paragraphs.";
}

export async function PATCH(_: Request, context: { params: Promise<{ paragraphId: string }> }) {
  try {
    const { paragraphId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: paragraph, error: paragraphError } = await supabase
      .from("paragraphs")
      .select("id,book_id,chapter_id,scene_id,paragraph_number,original_text,current_text,accepted_text,is_locked")
      .eq("id", paragraphId)
      .single();
    if (paragraphError) throw paragraphError;
    const row = paragraph as ParagraphRow;

    const { data: nextParagraph, error: nextError } = await supabase
      .from("paragraphs")
      .select("id,book_id,chapter_id,scene_id,paragraph_number,original_text,current_text,accepted_text,is_locked")
      .eq("chapter_id", row.chapter_id)
      .gt("paragraph_number", row.paragraph_number)
      .order("paragraph_number")
      .limit(1)
      .maybeSingle();
    if (nextError) throw nextError;
    if (!nextParagraph) return NextResponse.json({ error: "No next paragraph to merge." }, { status: 400 });

    const next = nextParagraph as ParagraphRow;
    const mergedOriginal = `${row.original_text.trim()}\n\n${next.original_text.trim()}`.trim();
    const mergedCurrent = mergeOptionalText(row.current_text, next.current_text);
    const mergedAccepted = mergeOptionalText(row.accepted_text, next.accepted_text);
    const { error: updateError } = await supabase
      .from("paragraphs")
      .update({
        original_text: mergedOriginal,
        current_text: mergedCurrent || mergedOriginal,
        accepted_text: mergedAccepted || null,
        is_locked: Boolean(row.is_locked || next.is_locked),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateError) throw updateError;

    const { error: deleteLockError } = await supabase.from("locked_passages").delete().eq("paragraph_id", next.id);
    if (deleteLockError) throw deleteLockError;
    const { error: deleteError } = await supabase.from("paragraphs").delete().eq("id", next.id);
    if (deleteError) throw deleteError;

    const { data: remaining, error: remainingError } = await supabase
      .from("paragraphs")
      .select("id")
      .eq("chapter_id", row.chapter_id)
      .order("paragraph_number");
    if (remainingError) throw remainingError;

    for (const [index, item] of (remaining || []).entries()) {
      const { error } = await supabase
        .from("paragraphs")
        .update({ paragraph_number: index + 1 })
        .eq("id", item.id);
      if (error) throw error;
    }

    return NextResponse.json({ content: { merged: true } });
  } catch (error) {
    console.error("Paragraph merge failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function mergeOptionalText(first: string | null, second: string | null) {
  if (!first && !second) return "";
  return `${(first || "").trim()}\n\n${(second || "").trim()}`.trim();
}
