import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { createClient } from "@/lib/supabase/server";

const assignmentStatusSchema = z.object({
  status: z.enum(["assigned", "in_progress", "completed", "cancelled"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ bookId: string; assignmentId: string }> }) {
  try {
    const { bookId, assignmentId } = await params;
    const body = assignmentStatusSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const assignment = await getAssignment(supabase, bookId, assignmentId);
    if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });

    const canEdit = await canEditBook(supabase, bookId);
    if (!canEdit && assignment.assignee_id !== user.id) {
      return NextResponse.json({ error: "Assignment update access denied." }, { status: 403 });
    }

    const completedAt = body.status === "completed" ? new Date().toISOString() : null;
    const { data, error } = await supabase
      .from("creativewriter_contributor_assignments")
      .update({
        status: body.status,
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignmentId)
      .eq("book_id", bookId)
      .select("id,book_id,chapter_id,paragraph_id,assignee_id,assigner_id,scope,status,title,note,due_at,created_at,updated_at,completed_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ assignment: data });
  } catch (error) {
    return assignmentStatusErrorResponse(error);
  }
}

async function getAssignment(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string, assignmentId: string) {
  const { data, error } = await supabase
    .from("creativewriter_contributor_assignments")
    .select("id,book_id,assignee_id,status")
    .eq("id", assignmentId)
    .eq("book_id", bookId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function canEditBook(supabase: Awaited<ReturnType<typeof createClient>>, bookId: string) {
  const { data, error } = await supabase.rpc("can_edit_book", { target_book_id: bookId });
  if (error) throw error;
  return data === true;
}

function assignmentStatusErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid assignment status payload.", details: error.issues }, { status: 400 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
}
