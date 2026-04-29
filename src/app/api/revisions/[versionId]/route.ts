import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  action: z.enum(["accept", "reject"]),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to update revision.";
}

export async function PATCH(request: Request, context: { params: Promise<{ versionId: string }> }) {
  try {
    const { versionId } = await context.params;
    const { action } = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: version, error: versionError } = await supabase
      .from("revision_versions")
      .select("id,book_id,chapter_id,scene_id,paragraph_id,revised_text")
      .eq("id", versionId)
      .single();
    if (versionError) throw versionError;

    if (action === "accept") {
      if (version.paragraph_id) {
        const { error: clearError } = await supabase
          .from("revision_versions")
          .update({ accepted: false })
          .eq("paragraph_id", version.paragraph_id)
          .eq("book_id", version.book_id);
        if (clearError) throw clearError;

        const { error: paragraphError } = await supabase
          .from("paragraphs")
          .update({
            accepted_text: version.revised_text,
            current_text: version.revised_text,
            updated_at: new Date().toISOString(),
          })
          .eq("id", version.paragraph_id);
        if (paragraphError) throw paragraphError;
      }

      const { error } = await supabase
        .from("revision_versions")
        .update({ accepted: true, rejected: false })
        .eq("id", versionId);
      if (error) throw error;

      await supabase.from("coherence_reports").insert({
        book_id: version.book_id,
        report_type: "continuity_ledger",
        content: {
          event: "revision_accepted",
          revisionVersionId: version.id,
          chapterId: version.chapter_id,
          sceneId: version.scene_id,
          paragraphId: version.paragraph_id,
          acceptedAt: new Date().toISOString(),
          note: "Accepted rewrite became the active paragraph text. Preserve this state in future rewrite context.",
        },
      });
      return NextResponse.json({ ok: true, action });
    }

    const { error } = await supabase
      .from("revision_versions")
      .update({ accepted: false, rejected: true })
      .eq("id", versionId);
    if (error) throw error;

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error("Revision update failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
