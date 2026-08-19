import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  chapterId: z.string().uuid(),
  name: z.string().min(1).max(200),
});

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = createSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: book } = await supabase.from("books").select("id").eq("id", bookId).eq("owner_id", user.id).single();
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const { data: paragraphs } = await supabase
      .from("paragraphs")
      .select("id,paragraph_number,original_text,accepted_text")
      .eq("book_id", bookId)
      .eq("chapter_id", body.chapterId)
      .order("paragraph_number");

    const paragraphTexts = (paragraphs || []).map((p) => ({
      id: p.id,
      paragraph_number: p.paragraph_number,
      text: p.accepted_text || p.original_text || "",
    }));

    const { data: snapshot, error } = await supabase
      .from("chapter_snapshots")
      .insert({ book_id: bookId, chapter_id: body.chapterId, name: body.name, paragraph_texts: paragraphTexts })
      .select("id,chapter_id,name,created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data } = await supabase
    .from("chapter_snapshots")
    .select("id,chapter_id,name,created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ snapshots: data || [] });
}
