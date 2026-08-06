import { NextResponse } from "next/server";
import { z } from "zod";
import { applySceneSplit, SceneSplitError } from "@/lib/structure/scenes";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  status: z.enum(["approved", "rejected"]),
});

type SuggestionRow = {
  id: string;
  start_paragraph_id: string;
  title: string;
  status: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to update suggestion.";
}

export async function PATCH(request: Request, context: { params: Promise<{ suggestionId: string }> }) {
  try {
    const { suggestionId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: suggestion, error: suggestionError } = await supabase
      .from("scene_split_suggestions")
      .select("id,start_paragraph_id,title,status")
      .eq("id", suggestionId)
      .single();
    if (suggestionError) throw suggestionError;
    const suggestionRow = suggestion as SuggestionRow;

    if (suggestionRow.status !== "pending") {
      return NextResponse.json({ error: "This suggestion has already been reviewed." }, { status: 400 });
    }

    // Approving applies the split immediately -- unlike Abridgement, there's
    // no later "export" moment to defer to, scenes are live structure. Apply
    // first, only flip status once the mutation actually succeeds, so a
    // failed apply never leaves a falsely-approved row.
    if (body.status === "approved") {
      await applySceneSplit(supabase, { paragraphId: suggestionRow.start_paragraph_id, title: suggestionRow.title });
    }

    const { data, error } = await supabase
      .from("scene_split_suggestions")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", suggestionId)
      .select("id,status")
      .single();
    if (error) throw error;

    return NextResponse.json({ content: data });
  } catch (error) {
    console.error("Scene split suggestion update failed", error);
    const status = error instanceof SceneSplitError ? 400 : 500;
    return NextResponse.json({ error: getErrorMessage(error) }, { status });
  }
}
