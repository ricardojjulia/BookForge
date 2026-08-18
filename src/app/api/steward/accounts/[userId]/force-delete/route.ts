import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Immediate, irreversible deletion -- skips the 30-day recoverable window
// entirely, for cases (spam, clearly fake accounts) where that safety net
// isn't the right fit. Still records a tracking row (status: purged from the
// start) purely as an audit trail -- the data itself is not recoverable once
// this succeeds, unlike the normal ban-based flow.
export async function POST(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const supabase = await createClient();
  const { user, response } = await requireStaff(supabase);
  if (!user) return response;

  const { userId } = await params;
  if (userId === user.id) {
    return NextResponse.json({ error: "You cannot force-delete your own account." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: targetUser } = await admin.auth.admin.getUserById(userId);
    const { data: profile } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    const now = new Date().toISOString();
    await admin.from("account_deletion_requests").insert({
      user_id: userId,
      email_at_request: targetUser?.user?.email || null,
      display_name_at_request: profile?.display_name || null,
      requested_at: now,
      purge_after: now,
      status: "purged",
      purged_at: now,
      purged_by: user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Steward force-delete failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete account." }, { status: 500 });
  }
}
