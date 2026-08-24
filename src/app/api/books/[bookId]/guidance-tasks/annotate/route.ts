import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  note: z.string().trim().min(1).max(2000),
  // Optional -- most guidance items name a specific chapter in their own
  // text ("In Chapter 4...", "For Chapter 2..."). When present, the note
  // gets attached to that chapter's first paragraph so it shows up
  // in-context in CreativeWriter's comment panel instead of as a
  // book-level note nobody can place. Items with no chapter reference
  // (the genuinely book-wide ones) fall back to a paragraph-less note.
  chapterId: z.string().uuid().optional(),
});

// Sends a Guidance suggestion to CreativeWriter as a real comment, rather
// than the only other option being an AI rewrite -- see the Guidance page's
// "Send to CreativeWriter" / "Run rewrite" pairing. Reuses the same
// reader_annotations table and RLS as /api/books/[bookId]/annotations;
// this route's only job on top of that is resolving a chapter reference to
// the paragraph CreativeWriter actually needs to jump to.
export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = schema.parse(await request.json());

  let paragraphId: string | null = null;
  if (body.chapterId) {
    const { data: firstParagraph, error: paragraphError } = await supabase
      .from("paragraphs")
      .select("id")
      .eq("book_id", bookId)
      .eq("chapter_id", body.chapterId)
      .order("paragraph_number")
      .limit(1)
      .maybeSingle();
    if (paragraphError) return NextResponse.json({ error: paragraphError.message }, { status: 500 });
    paragraphId = firstParagraph?.id || null;
  }

  const { data, error } = await supabase
    .from("reader_annotations")
    .insert({ book_id: bookId, paragraph_id: paragraphId, annotator_id: user.id, note: body.note })
    .select("id,paragraph_id,note,resolved,created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ annotation: data });
}
