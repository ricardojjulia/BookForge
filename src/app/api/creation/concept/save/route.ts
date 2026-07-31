import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  creationProjectId: z.string().uuid(),
  concept: z.record(z.string(), z.unknown()),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to save concept.";
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: project, error: projectError } = await supabase
      .from("creation_projects")
      .select("id")
      .eq("id", body.creationProjectId)
      .eq("owner_id", user.id)
      .single();
    if (projectError) throw projectError;

    await supabase
      .from("creation_plan_versions")
      .update({ accepted: false })
      .eq("creation_project_id", project.id)
      .eq("version_type", "concept");

    const { data: acceptedConcept, error: conceptError } = await supabase
      .from("creation_plan_versions")
      .insert({
        creation_project_id: project.id,
        version_type: "concept",
        content: body.concept,
        accepted: true,
      })
      .select("id,created_at")
      .single();
    if (conceptError) throw conceptError;

    const { error: updateError } = await supabase
      .from("creation_projects")
      .update({ status: "concept", updated_at: new Date().toISOString() })
      .eq("id", project.id);
    if (updateError) throw updateError;

    return NextResponse.json({
      content: {
        acceptedConcept,
      },
    });
  } catch (error) {
    console.error("Save concept failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
