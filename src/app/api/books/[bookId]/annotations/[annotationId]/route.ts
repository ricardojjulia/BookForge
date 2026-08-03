import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z.object({ resolved: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ bookId: string; annotationId: string }> }) {
  try {
    const { bookId, annotationId } = await params;
    const body = patchSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const access = await getAnnotationAccess(supabase, bookId, annotationId, user.id);
    if (!access.found) return NextResponse.json({ error: "Reader comment not found." }, { status: 404 });
    if (!access.allowed) return NextResponse.json({ error: "You do not have permission to update this reader comment." }, { status: 403 });

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
    return annotationErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ bookId: string; annotationId: string }> }) {
  try {
    const { bookId, annotationId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const access = await getAnnotationAccess(supabase, bookId, annotationId, user.id);
    if (!access.found) return NextResponse.json({ error: "Reader comment not found." }, { status: 404 });
    if (!access.allowed) return NextResponse.json({ error: "You do not have permission to delete this reader comment." }, { status: 403 });

    const { error } = await supabase.from("reader_annotations").delete().eq("id", annotationId).eq("book_id", bookId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return annotationErrorResponse(error);
  }
}

async function getAnnotationAccess(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string, annotationId: string, userId: string) {
  const { data: annotation, error } = await supabase
    .from("reader_annotations")
    .select("id,annotator_id")
    .eq("id", annotationId)
    .eq("book_id", bookId)
    .maybeSingle();
  if (error) throw error;
  if (!annotation) return { found: false, allowed: false };
  if (annotation.annotator_id === userId) return { found: true, allowed: true };

  const { data: canEdit, error: canEditError } = await supabase.rpc("can_edit_book", { target_book_id: bookId });
  if (canEditError) throw canEditError;
  return { found: true, allowed: canEdit === true };
}

function annotationErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid annotation payload.", details: error.issues }, { status: 400 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
}
