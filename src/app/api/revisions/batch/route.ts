import { NextResponse } from "next/server";
import { z } from "zod";
import { markBookRevising } from "@/lib/books/status";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  action: z.enum(["accept", "reject"]),
  versionIds: z.array(z.string().uuid()).min(1).max(200),
});

type RevisionForBatch = {
  id: string;
  book_id: string;
  paragraph_id: string | null;
  revised_text: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to update revisions.";
}

export async function PATCH(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data, error } = await supabase
      .from("revision_versions")
      .select("id,book_id,paragraph_id,revised_text")
      .in("id", body.versionIds);
    if (error) throw error;

    const versions = (data || []) as RevisionForBatch[];
    if (!versions.length) {
      return NextResponse.json({ error: "No matching revisions found." }, { status: 404 });
    }

    if (body.action === "reject") {
      const { error: rejectError } = await supabase
        .from("revision_versions")
        .update({ accepted: false, rejected: true })
        .in("id", versions.map((version) => version.id));
      if (rejectError) throw rejectError;
      return NextResponse.json({ content: { updated: versions.length, action: body.action } });
    }

    const acceptedEvents: Array<Record<string, unknown>> = [];
    for (const version of versions) {
      if (!version.paragraph_id) continue;

      const { error: clearError } = await supabase
        .from("revision_versions")
        .update({ accepted: false, rejected: true })
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

      const { error: acceptError } = await supabase
        .from("revision_versions")
        .update({ accepted: true, rejected: false })
        .eq("id", version.id);
      if (acceptError) throw acceptError;

      acceptedEvents.push({
        revisionVersionId: version.id,
        paragraphId: version.paragraph_id,
      });
    }

    await supabase.from("coherence_reports").insert({
      book_id: versions[0].book_id,
      report_type: "continuity_ledger",
      content: {
        event: "revision_batch_accepted",
        acceptedAt: new Date().toISOString(),
        acceptedCount: acceptedEvents.length,
        acceptedEvents,
        note: "Batch accepted rewrites became active paragraph text. Preserve this state in future rewrite context.",
      },
    });
    await markBookRevising(supabase, versions[0].book_id);

    return NextResponse.json({ content: { updated: versions.length, action: body.action } });
  } catch (error) {
    console.error("Batch revision update failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
