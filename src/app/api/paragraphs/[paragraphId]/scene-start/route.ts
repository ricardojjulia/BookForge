import { NextResponse } from "next/server";
import { z } from "zod";
import { applySceneSplit, SceneSplitError } from "@/lib/structure/scenes";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  title: z.string().max(160).optional(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to create scene.";
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

    const { sceneId } = await applySceneSplit(supabase, { paragraphId, title: body.title });
    return NextResponse.json({ content: { created: true, sceneId } });
  } catch (error) {
    console.error("Scene creation failed", error);
    const status = error instanceof SceneSplitError ? 400 : 500;
    return NextResponse.json({ error: getErrorMessage(error) }, { status });
  }
}
