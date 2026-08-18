import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const supabase = await createClient();
  const { user, response } = await requireStaff(supabase);
  if (!user) return response;

  const { userId } = await params;

  try {
    const admin = createAdminClient();
    const { error: unbanError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    if (unbanError) throw unbanError;

    const { error: updateError } = await admin
      .from("account_deletion_requests")
      .update({ status: "restored", restored_at: new Date().toISOString(), restored_by: user.id })
      .eq("user_id", userId)
      .in("status", ["pending", "ready_for_purge"]);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Steward account restore failed", error);
    return NextResponse.json({ error: "Unable to restore account." }, { status: 500 });
  }
}
