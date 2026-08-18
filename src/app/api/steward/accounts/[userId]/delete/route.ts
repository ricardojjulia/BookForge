import { NextResponse } from "next/server";
import { requestAccountDeletion } from "@/lib/accounts/deletion";
import { requireStaff } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const supabase = await createClient();
  const { user, response } = await requireStaff(supabase);
  if (!user) return response;

  const { userId } = await params;

  try {
    const admin = createAdminClient();
    const [{ data: targetUser, error: userError }, { data: profile }] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    ]);
    if (userError || !targetUser?.user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    const { purgeAfter } = await requestAccountDeletion(admin, {
      userId,
      email: targetUser.user.email || null,
      displayName: profile?.display_name || null,
    });

    return NextResponse.json({ ok: true, purgeAfter });
  } catch (error) {
    console.error("Steward-initiated account deletion failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start deletion." }, { status: 500 });
  }
}
