import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  paragraphId: z.string().uuid().optional(),
  note: z.string().trim().min(1).max(2000),
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
      .from("reader_annotations")
      .select("id,paragraph_id,annotator_id,note,resolved,created_at,profiles(display_name)")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ annotations: data || [] });
  } catch (error) {
    return annotationErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = createSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const canView = await canViewBook(supabase, bookId);
    if (!canView) return NextResponse.json({ error: "Book not found." }, { status: 404 });
    if (body.paragraphId) {
      const paragraphBelongsToBook = await hasParagraphInBook(supabase, bookId, body.paragraphId);
      if (!paragraphBelongsToBook) return NextResponse.json({ error: "Paragraph not found for this book." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("reader_annotations")
      .insert({ book_id: bookId, paragraph_id: body.paragraphId || null, annotator_id: user.id, note: body.note })
      .select("id,paragraph_id,note,resolved,created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ annotation: data });
  } catch (error) {
    return annotationErrorResponse(error);
  }
}

async function canViewBook(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string) {
  const { data, error } = await supabase.rpc("can_view_book", { target_book_id: bookId });
  if (error) throw error;
  return data === true;
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

function annotationErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid annotation payload.", details: error.issues }, { status: 400 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
}
