import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  reportId: z.string().uuid(),
  itemKey: z.string().min(1),
  status: z.enum(["todo", "in_progress", "done", "skipped"]),
});

export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabase
    .from("guidance_tasks")
    .select("id, report_id, item_key, status, updated_at")
    .eq("book_id", bookId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data ?? [] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = patchSchema.parse(await request.json());

  const { data, error } = await supabase
    .from("guidance_tasks")
    .upsert(
      {
        book_id: bookId,
        report_id: body.reportId,
        item_key: body.itemKey,
        status: body.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "report_id,item_key" },
    )
    .select("id, item_key, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}
