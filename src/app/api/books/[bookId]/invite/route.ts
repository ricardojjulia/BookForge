import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendCollaboratorInvite } from "@/lib/email";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["viewer", "editor", "admin"]),
});

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: book } = await supabase.from("books").select("id,title").eq("id", bookId).eq("owner_id", user.id).single();
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const { data: invite, error } = await supabase
      .from("collaborator_invites")
      .insert({ book_id: bookId, invited_by: user.id, email: body.email, role: body.role })
      .select("id,token,email,role,expires_at")
      .single();
    if (error) throw error;

    const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:4747"}/invite/${invite.token}`;

    // The invite itself (a real, usable link, already saved above) must not
    // be lost just because the notification email failed to send -- e.g. a
    // misconfigured RESEND_FROM domain that isn't verified with Resend.
    // Found live: this exact failure mode took down the whole route,
    // returning a 500 for an invite that had actually been created
    // successfully, with nothing logged anywhere to diagnose it from.
    let emailSent = false;
    try {
      const result = await sendCollaboratorInvite({
        toEmail: invite.email,
        bookTitle: book.title,
        inviteUrl,
        role: invite.role,
        invitedByEmail: user.email ?? "A BookForge user",
      });
      emailSent = result.sent;
    } catch (emailError) {
      console.error("Collaborator invite email failed to send", emailError);
    }

    return NextResponse.json({ invite, inviteUrl, emailSent });
  } catch (error) {
    console.error("Collaborator invite failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data } = await supabase
    .from("collaborator_invites")
    .select("id,email,role,accepted_at,expires_at,created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ invites: data || [] });
}
