import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data } = await supabase
    .from("book_collaborators")
    .select("id,user_id,role,created_at,profiles(display_name,email)")
    .eq("book_id", bookId)
    .order("created_at");

  return NextResponse.json({ collaborators: data || [] });
}
