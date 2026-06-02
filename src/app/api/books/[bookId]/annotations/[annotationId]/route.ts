import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ bookId: string; annotationId: string }> }) {
  try {
    const { bookId, annotationId } = await params;
    const body = await request.json() as { resolved?: boolean };
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data, error } = await supabase
      .from("reader_annotations")
      .update({ resolved: body.resolved })
      .eq("id", annotationId)
      .eq("book_id", bookId)
      .select("id,resolved")
      .single();
    if (error) throw error;

    return NextResponse.json({ annotation: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ bookId: string; annotationId: string }> }) {
  try {
    const { bookId, annotationId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    await supabase.from("reader_annotations").delete().eq("id", annotationId).eq("book_id", bookId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
