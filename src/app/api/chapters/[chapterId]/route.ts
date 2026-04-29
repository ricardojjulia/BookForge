import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  title: z.string().max(300).nullable().optional(),
  sectionType: z.enum(["front_matter", "body", "back_matter"]).optional(),
  excludeFromRewrite: z.boolean().optional(),
  excludeFromExport: z.boolean().optional(),
  structureNotes: z.string().max(2000).nullable().optional(),
  clearSummary: z.boolean().default(true),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to update chapter.";
}

export async function PATCH(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  try {
    const { chapterId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if ("title" in body) update.title = body.title?.trim() || null;
    if (body.sectionType) update.section_type = body.sectionType;
    if (typeof body.excludeFromRewrite === "boolean") update.exclude_from_rewrite = body.excludeFromRewrite;
    if (typeof body.excludeFromExport === "boolean") update.exclude_from_export = body.excludeFromExport;
    if ("structureNotes" in body) update.structure_notes = body.structureNotes?.trim() || null;
    if (body.clearSummary) {
      update.summary = null;
      update.status = "pending";
    }

    const { data, error } = await supabase.from("chapters").update(update).eq("id", chapterId).select("*").single();
    if (error) throw error;
    return NextResponse.json({ content: { chapter: data } });
  } catch (error) {
    console.error("Update chapter failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
