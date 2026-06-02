import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string; snapshotId: string }> }) {
  try {
    const { bookId, snapshotId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: book } = await supabase.from("books").select("id").eq("id", bookId).eq("owner_id", user.id).single();
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const { data: snapshot } = await supabase
      .from("chapter_snapshots")
      .select("chapter_id,paragraph_texts")
      .eq("id", snapshotId)
      .eq("book_id", bookId)
      .single();
    if (!snapshot) return NextResponse.json({ error: "Snapshot not found." }, { status: 404 });

    const paragraphTexts = snapshot.paragraph_texts as Array<{ id: string; text: string }>;
    for (const entry of paragraphTexts) {
      await supabase.from("paragraphs").update({ accepted_text: entry.text }).eq("id", entry.id).eq("book_id", bookId);
    }

    return NextResponse.json({ ok: true, restoredCount: paragraphTexts.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ bookId: string; snapshotId: string }> }) {
  try {
    const { bookId, snapshotId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    await supabase.from("chapter_snapshots").delete().eq("id", snapshotId).eq("book_id", bookId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
