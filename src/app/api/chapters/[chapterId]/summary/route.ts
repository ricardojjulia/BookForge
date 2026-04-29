import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to erase summary.";
}

export async function DELETE(_: Request, context: { params: Promise<{ chapterId: string }> }) {
  try {
    const { chapterId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { error } = await supabase
      .from("chapters")
      .update({
        summary: null,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", chapterId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erase chapter summary failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
