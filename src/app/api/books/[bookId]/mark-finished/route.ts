import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  exportId: z.string().uuid().nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: book } = await supabase
      .from("books")
      .select("id,owner_id")
      .eq("id", bookId)
      .eq("owner_id", user.id)
      .single();
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    if (body.exportId) {
      const { data: exportRow } = await supabase
        .from("exports")
        .select("id,status")
        .eq("id", body.exportId)
        .eq("book_id", bookId)
        .single();
      if (!exportRow) return NextResponse.json({ error: "Export not found for this book." }, { status: 404 });
      if (exportRow.status !== "completed") return NextResponse.json({ error: "Only completed exports can be marked as the finished version." }, { status: 400 });
    }

    const { error } = await supabase
      .from("books")
      .update({
        status: body.exportId ? "finished" : "draft",
        finished_export_id: body.exportId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("mark-finished failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
