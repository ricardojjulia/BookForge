import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const createThreadSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  mode: z.enum(["ask", "edit", "run", "council"]).optional(),
  contextPolicy: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const supabase = await createClient();
    const { user, error: authError } = await getAuthenticatedUser(supabase);
    if (authError || !user) return unauthorizedResponse();

    const { data, error } = await supabase
      .from("chat_threads")
      .select("id,title,mode,last_message_preview,last_message_at,updated_at,created_at")
      .eq("book_id", bookId)
      .eq("is_archived", false)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(40);

    if (error) {
      if (isMissingChatSchema(error)) {
        return NextResponse.json({
          threads: [],
          unavailable: true,
          reason: "Chat workspace tables are not installed. Run the latest Supabase migrations.",
        });
      }
      throw error;
    }

    return NextResponse.json({ threads: data || [] });
  } catch (error) {
    console.error("Chat threads load failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load chat threads." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = createThreadSchema.parse(await request.json().catch(() => ({})));
    const supabase = await createClient();
    const { user, error: authError } = await getAuthenticatedUser(supabase);
    if (authError || !user) return unauthorizedResponse();

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("chat_threads")
      .insert({
        book_id: bookId,
        created_by: user.id,
        title: body.title || "New chat",
        mode: body.mode || "ask",
        context_policy: body.contextPolicy || {},
        updated_at: now,
      })
      .select("id,title,mode,last_message_preview,last_message_at,updated_at,created_at")
      .single();

    if (error) {
      if (isMissingChatSchema(error)) {
        return NextResponse.json(
          { error: "Chat workspace tables are not installed. Run the latest Supabase migrations." },
          { status: 503 },
        );
      }
      throw error;
    }

    return NextResponse.json({ thread: data });
  } catch (error) {
    console.error("Chat thread create failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create chat thread." }, { status: 500 });
  }
}

function isMissingChatSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; message?: string };
  if (record.code === "42P01" || record.code === "PGRST205") return true;
  const message = String(record.message || "").toLowerCase();
  return message.includes("chat_threads") && (message.includes("does not exist") || message.includes("schema cache"));
}
