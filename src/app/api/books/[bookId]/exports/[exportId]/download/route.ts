import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ bookId: string; exportId: string }> }) {
  const { bookId, exportId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  // Rely on RLS (books view access: owner OR a named collaborator OR platform
  // staff) rather than hardcoding owner_id -- the previous literal owner check
  // silently blocked legitimate collaborators from downloading exports, not just
  // staff.
  const { data: book } = await supabase.from("books").select("id").eq("id", bookId).single();
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  const { data: exportRow } = await supabase
    .from("exports")
    .select("id,status,storage_path")
    .eq("id", exportId)
    .eq("book_id", bookId)
    .single();
  if (!exportRow?.storage_path || exportRow.status !== "completed") {
    return NextResponse.json({ error: "Export not available for download." }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage.from("exports").createSignedUrl(exportRow.storage_path, 60);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not create a download link." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
