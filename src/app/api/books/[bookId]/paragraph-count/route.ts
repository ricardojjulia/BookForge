import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { count, error } = await supabase
      .from("paragraphs")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId);
    if (error) throw error;

    return NextResponse.json({ count: count ?? 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to count paragraphs." }, { status: 500 });
  }
}
