import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z.object({ role: z.enum(["viewer", "editor", "admin"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ bookId: string; collaboratorId: string }> }) {
  try {
    const { bookId, collaboratorId } = await params;
    const body = patchSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: book } = await supabase.from("books").select("id").eq("id", bookId).eq("owner_id", user.id).single();
    if (!book) return NextResponse.json({ error: "Only the book owner can change roles." }, { status: 403 });

    const { data, error } = await supabase
      .from("book_collaborators")
      .update({ role: body.role })
      .eq("id", collaboratorId)
      .eq("book_id", bookId)
      .select("id,role")
      .single();
    if (error) throw error;
    return NextResponse.json({ collaborator: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ bookId: string; collaboratorId: string }> }) {
  try {
    const { bookId, collaboratorId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: book } = await supabase.from("books").select("id").eq("id", bookId).eq("owner_id", user.id).single();
    if (!book) return NextResponse.json({ error: "Only the book owner can remove collaborators." }, { status: 403 });

    await supabase.from("book_collaborators").delete().eq("id", collaboratorId).eq("book_id", bookId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
