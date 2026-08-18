import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserIdByEmail } from "@/lib/accounts/steward-directory";
import { requireStaff } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  newOwnerEmail: z.string().email(),
});

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const supabase = await createClient();
  const { user, response } = await requireStaff(supabase);
  if (!user) return response;

  const { bookId } = await params;

  try {
    const body = schema.parse(await request.json());
    const admin = createAdminClient();

    const { data: book, error: bookError } = await admin.from("books").select("id, owner_id, title").eq("id", bookId).maybeSingle();
    if (bookError) throw bookError;
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const newOwnerId = await findUserIdByEmail(admin, body.newOwnerEmail);
    if (!newOwnerId) return NextResponse.json({ error: `No account found for ${body.newOwnerEmail}.` }, { status: 404 });
    if (newOwnerId === book.owner_id) return NextResponse.json({ error: "That account already owns this book." }, { status: 400 });

    const { error: updateError } = await admin
      .from("books")
      .update({ owner_id: newOwnerId, updated_at: new Date().toISOString() })
      .eq("id", bookId);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, newOwnerId });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request." }, { status: 400 });
    console.error("Steward book transfer failed", error);
    return NextResponse.json({ error: "Unable to transfer book." }, { status: 500 });
  }
}
