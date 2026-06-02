import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ seriesId: string; noteId: string }> }) {
  try {
    const { seriesId, noteId } = await params;
    const body = await request.json() as Record<string, unknown>;
    const safe = Object.fromEntries(Object.entries(body).filter(([k]) => !["id", "series_id", "created_at"].includes(k)));
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data, error } = await supabase.from("series_notes").update({ ...safe, updated_at: new Date().toISOString() }).eq("id", noteId).eq("series_id", seriesId).select("*").single();
    if (error) throw error;
    return NextResponse.json({ note: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ seriesId: string; noteId: string }> }) {
  try {
    const { seriesId, noteId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    await supabase.from("series_notes").delete().eq("id", noteId).eq("series_id", seriesId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
