import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const NOTE_TYPES = ["character", "timeline", "world", "plot_thread", "other"] as const;

const createSchema = z.object({
  note_type: z.enum(NOTE_TYPES),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(8000),
});

export async function GET(_req: Request, { params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data } = await supabase.from("series_notes").select("*").eq("series_id", seriesId).order("note_type").order("created_at");
  return NextResponse.json({ notes: data || [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ seriesId: string }> }) {
  try {
    const { seriesId } = await params;
    const body = createSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: series } = await supabase.from("series").select("id").eq("id", seriesId).eq("owner_id", user.id).single();
    if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });

    const { data, error } = await supabase.from("series_notes").insert({ series_id: seriesId, ...body }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ note: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
