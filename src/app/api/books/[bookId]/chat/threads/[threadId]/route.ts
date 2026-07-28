import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookId: string; threadId: string }> },
) {
  try {
    const { bookId, threadId } = await params;
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(120, Number(url.searchParams.get("limit") || 60)));

    const supabase = await createClient();
    const { user, error: authError } = await getAuthenticatedUser(supabase);
    if (authError || !user) return unauthorizedResponse();

    const { data: thread, error: threadError } = await supabase
      .from("chat_threads")
      .select("id,book_id,title,mode,context_policy,pinned_context,last_message_preview,last_message_at,updated_at,created_at")
      .eq("id", threadId)
      .eq("book_id", bookId)
      .single();

    if (threadError) throw threadError;
    if (!thread) return NextResponse.json({ error: "Chat thread not found." }, { status: 404 });

    const { data: messages, error: messagesError } = await supabase
      .from("chat_messages")
      .select("id,thread_id,role,content,content_json,status,token_usage,model_info,parent_message_id,created_by,created_at")
      .eq("thread_id", threadId)
      .eq("book_id", bookId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (messagesError) throw messagesError;

    return NextResponse.json({ thread, messages: messages || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load chat thread." }, { status: 500 });
  }
}
