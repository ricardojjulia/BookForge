import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  status: z.enum(["approved", "rejected", "pending"]),
});

export async function PATCH(request: Request, context: { params: Promise<{ suggestionId: string }> }) {
  try {
    const { suggestionId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data, error } = await supabase
      .from("abridgement_suggestions")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", suggestionId)
      .select("id,status")
      .single();
    if (error) throw error;
    return NextResponse.json({ content: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update suggestion." }, { status: 500 });
  }
}
