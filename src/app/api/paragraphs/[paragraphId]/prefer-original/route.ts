import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ParagraphRow = {
  id: string;
  book_id: string;
  original_text: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to restore original text.";
}

// Lets a reader revert a paragraph to its original text in one step, from
// inside the reading flow rather than the separate /revisions review table.
// Reuses the same accept/reject flag machinery as every other revision
// decision in the app (see accept-latest-revisions) instead of a one-off
// overwrite: the currently-accepted revision is marked rejected, keeping
// revision_versions history consistent with the paragraph's restored state.
export async function PATCH(_request: Request, context: { params: Promise<{ paragraphId: string }> }) {
  try {
    const { paragraphId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: paragraph, error: paragraphError } = await supabase
      .from("paragraphs")
      .select("id,book_id,original_text")
      .eq("id", paragraphId)
      .single();
    if (paragraphError) throw paragraphError;
    const row = paragraph as ParagraphRow;

    const { error: rejectError } = await supabase
      .from("revision_versions")
      .update({ accepted: false, rejected: true })
      .eq("paragraph_id", paragraphId)
      .eq("accepted", true);
    if (rejectError) throw rejectError;

    const { error: updateError } = await supabase
      .from("paragraphs")
      .update({
        accepted_text: null,
        current_text: row.original_text,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paragraphId);
    if (updateError) throw updateError;

    return NextResponse.json({ content: { paragraphId, text: row.original_text } });
  } catch (error) {
    console.error("Prefer-original failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
