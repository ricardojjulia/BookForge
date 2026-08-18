import { NextResponse } from "next/server";
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

    // Only ever purge a row the flagging job has actually marked ready -- this is
    // the application-level guard against purging an account whose 30-day window
    // hasn't elapsed, independent of whatever the UI happens to show.
    const { data: pendingRequest, error: findError } = await admin
      .from("account_deletion_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "ready_for_purge")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;
    if (!pendingRequest) return NextResponse.json({ error: "This account is not flagged as ready for purge." }, { status: 409 });

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      await admin
        .from("account_deletion_requests")
        .update({ purge_error: deleteError.message })
        .eq("id", pendingRequest.id);
      throw deleteError;
    }

    const { error: updateError } = await admin
      .from("account_deletion_requests")
      .update({ status: "purged", purged_at: new Date().toISOString(), purge_error: null })
      .eq("id", pendingRequest.id);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Steward account purge failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to purge account." }, { status: 500 });
  }
}
