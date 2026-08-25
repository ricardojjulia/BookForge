import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendCollaboratorInvite } from "@/lib/email";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["viewer", "editor", "admin"]),
});

// Supabase's PostgrestError isn't an Error instance (thrown as-is by the
// `if (error) throw error` below), so `error instanceof Error` misses it --
// found live via a masked "Failed." response on the sibling accept-invite
// route that hid a real RLS permission-denied error underneath.
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Failed.";
}

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
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
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
