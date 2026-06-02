import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  paragraphId: z.string().uuid().optional(),
  note: z.string().min(1).max(2000),
});

export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data } = await supabase
    .from("reader_annotations")
    .select("id,paragraph_id,annotator_id,note,resolved,created_at,profiles(display_name)")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ annotations: data || [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = createSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data, error } = await supabase
      .from("reader_annotations")
      .insert({ book_id: bookId, paragraph_id: body.paragraphId || null, annotator_id: user.id, note: body.note })
      .select("id,paragraph_id,note,resolved,created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ annotation: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
