import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data } = await supabase.from("series").select("id,title,description,created_at").eq("owner_id", user.id).order("created_at", { ascending: false });
  return NextResponse.json({ series: data || [] });
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data, error } = await supabase.from("series").insert({ ...body, owner_id: user.id }).select("id,title,description,created_at").single();
    if (error) throw error;
    return NextResponse.json({ series: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
