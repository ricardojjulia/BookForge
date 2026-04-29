import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  title: z.string().max(160).nullable(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to update scene.";
}

export async function PATCH(request: Request, context: { params: Promise<{ sceneId: string }> }) {
  try {
    const { sceneId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { error } = await supabase
      .from("scenes")
      .update({ title: body.title?.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", sceneId);
    if (error) throw error;

    return NextResponse.json({ content: { updated: true } });
  } catch (error) {
    console.error("Scene update failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
