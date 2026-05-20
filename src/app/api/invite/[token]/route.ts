import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "You must be signed in to accept an invite." }, { status: 401 });

    const { data: invite } = await supabase
      .from("collaborator_invites")
      .select("id,book_id,role,accepted_at,expires_at,email")
      .eq("token", token)
      .single();

    if (!invite) return NextResponse.json({ error: "Invite not found or already used." }, { status: 404 });
    if (invite.accepted_at) return NextResponse.json({ error: "This invite has already been accepted." }, { status: 400 });
    if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: "This invite has expired." }, { status: 400 });

    const { error: collabError } = await supabase
      .from("book_collaborators")
      .upsert({ book_id: invite.book_id, user_id: user.id, role: invite.role }, { onConflict: "book_id,user_id" });
    if (collabError) throw collabError;

    await supabase.from("collaborator_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);

    return NextResponse.json({ ok: true, bookId: invite.book_id, role: invite.role });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}
