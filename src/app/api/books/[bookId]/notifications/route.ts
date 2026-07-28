import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  notificationIds: z.array(z.string().uuid()).min(1).max(200),
});

export async function GET(_request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabase
    .from("collaboration_notifications")
    .select("id,event_type,title,body,metadata,read_at,created_at")
    .eq("book_id", bookId)
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: data || [] });
}

export async function PATCH(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const body = patchSchema.parse(await request.json());
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("collaboration_notifications")
      .update({ read_at: now })
      .eq("book_id", bookId)
      .eq("recipient_user_id", user.id)
      .in("id", body.notificationIds);
    if (error) throw error;

    return NextResponse.json({ content: { markedRead: body.notificationIds.length } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to mark notifications." }, { status: 500 });
  }
}
