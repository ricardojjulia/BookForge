import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSuggestionSchema = z.object({
  chapterId: z.string().uuid().optional(),
  paragraphId: z.string().uuid().optional(),
  originalTextSnapshot: z.string().max(20000).optional(),
  suggestedText: z.string().trim().min(1).max(20000),
  rationale: z.string().trim().max(4000).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const canView = await canViewBook(supabase, bookId);
    if (!canView) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const { data, error } = await supabase
      .from("creativewriter_contributor_suggestions")
      .select("id,book_id,chapter_id,paragraph_id,proposer_id,reviewer_id,status,original_text_snapshot,suggested_text,rationale,review_note,created_at,updated_at,reviewed_at,applied_at,withdrawn_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ suggestions: data || [] });
  } catch (error) {
    return suggestionErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = createSuggestionSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const canView = await canViewBook(supabase, bookId);
    if (!canView) return NextResponse.json({ error: "Book not found." }, { status: 404 });
    if (body.chapterId) {
      const chapterBelongsToBook = await hasChapterInBook(supabase, bookId, body.chapterId);
      if (!chapterBelongsToBook) return NextResponse.json({ error: "Chapter not found for this book." }, { status: 400 });
    }
    if (body.paragraphId) {
      const paragraphBelongsToBook = await hasParagraphInBook(supabase, bookId, body.paragraphId);
      if (!paragraphBelongsToBook) return NextResponse.json({ error: "Paragraph not found for this book." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("creativewriter_contributor_suggestions")
      .insert({
        book_id: bookId,
        chapter_id: body.chapterId || null,
        paragraph_id: body.paragraphId || null,
        proposer_id: user.id,
        status: "proposed",
        original_text_snapshot: body.originalTextSnapshot || null,
        suggested_text: body.suggestedText,
        rationale: body.rationale || null,
      })
      .select("id,book_id,chapter_id,paragraph_id,proposer_id,status,original_text_snapshot,suggested_text,rationale,created_at,updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ suggestion: data });
  } catch (error) {
    return suggestionErrorResponse(error);
  }
}

async function canViewBook(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string) {
  const { data, error } = await supabase.rpc("can_view_book", { target_book_id: bookId });
  if (error) throw error;
  return data === true;
}

async function hasChapterInBook(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string, chapterId: string) {
  const { data, error } = await supabase
    .from("chapters")
    .select("id")
    .eq("id", chapterId)
    .eq("book_id", bookId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function hasParagraphInBook(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string, paragraphId: string) {
  const { data, error } = await supabase
    .from("paragraphs")
    .select("id")
    .eq("id", paragraphId)
    .eq("book_id", bookId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function suggestionErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid suggestion payload.", details: error.issues }, { status: 400 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
}
