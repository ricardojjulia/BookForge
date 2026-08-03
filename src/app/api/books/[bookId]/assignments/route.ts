import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createAssignmentSchema = z.object({
  assigneeId: z.string().uuid(),
  chapterId: z.string().uuid().optional(),
  paragraphId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(240),
  note: z.string().trim().max(4000).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
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
      .from("creativewriter_contributor_assignments")
      .select("id,book_id,chapter_id,paragraph_id,assignee_id,assigner_id,scope,status,title,note,due_at,created_at,updated_at,completed_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ assignments: data || [] });
  } catch (error) {
    return assignmentErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = createAssignmentSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const canEdit = await canEditBook(supabase, bookId);
    if (!canEdit) return NextResponse.json({ error: "Book not found or edit access denied." }, { status: 404 });

    const assigneeInBook = await hasAssigneeInBook(supabase, bookId, body.assigneeId);
    if (!assigneeInBook) return NextResponse.json({ error: "Assignee is not a collaborator on this book." }, { status: 400 });

    if (body.chapterId) {
      const chapterBelongsToBook = await hasChapterInBook(supabase, bookId, body.chapterId);
      if (!chapterBelongsToBook) return NextResponse.json({ error: "Chapter not found for this book." }, { status: 400 });
    }
    if (body.paragraphId) {
      const paragraphBelongsToBook = await hasParagraphInBook(supabase, bookId, body.paragraphId);
      if (!paragraphBelongsToBook) return NextResponse.json({ error: "Paragraph not found for this book." }, { status: 400 });
    }

    const scope = body.paragraphId ? "paragraph" : body.chapterId ? "chapter" : "book";
    const { data, error } = await supabase
      .from("creativewriter_contributor_assignments")
      .insert({
        book_id: bookId,
        chapter_id: body.chapterId || null,
        paragraph_id: body.paragraphId || null,
        assignee_id: body.assigneeId,
        assigner_id: user.id,
        scope,
        status: "assigned",
        title: body.title,
        note: body.note || null,
        due_at: body.dueAt || null,
      })
      .select("id,book_id,chapter_id,paragraph_id,assignee_id,assigner_id,scope,status,title,note,due_at,created_at,updated_at,completed_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ assignment: data });
  } catch (error) {
    return assignmentErrorResponse(error);
  }
}

async function canViewBook(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string) {
  const { data, error } = await supabase.rpc("can_view_book", { target_book_id: bookId });
  if (error) throw error;
  return data === true;
}

async function canEditBook(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string) {
  const { data, error } = await supabase.rpc("can_edit_book", { target_book_id: bookId });
  if (error) throw error;
  return data === true;
}

async function hasAssigneeInBook(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string, assigneeId: string) {
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("owner_id")
    .eq("id", bookId)
    .maybeSingle();
  if (bookError) throw bookError;
  if (book?.owner_id === assigneeId) return true;

  const { data, error } = await supabase
    .from("book_collaborators")
    .select("user_id")
    .eq("book_id", bookId)
    .eq("user_id", assigneeId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
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

function assignmentErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid assignment payload.", details: error.issues }, { status: 400 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
}
