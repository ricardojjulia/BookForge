import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const RETENTION_DAYS = 30;

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const admin = createAdminClient();

    // Ban rather than delete: blocks login immediately without touching any FK or
    // cascade, so every book/chapter/paragraph/revision the user owns survives
    // untouched. A Steward can restore within the retention window; nothing is
    // permanently destroyed until an explicit, separate purge action.
    const { error: banError } = await admin.auth.admin.updateUserById(user.id, { ban_duration: `${RETENTION_DAYS * 24}h` });
    if (banError) throw banError;

    const purgeAfter = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: trackingError } = await admin.from("account_deletion_requests").insert({
      user_id: user.id,
      email_at_request: user.email,
      display_name_at_request: profile?.display_name || null,
      purge_after: purgeAfter,
    });
    if (trackingError) throw trackingError;

    // Session-scoped signOut as defense-in-depth: the client already calls this
    // too, this covers the case where the client-side call never fires (e.g. a
    // dropped connection right after this response resolves).
    await supabase.auth.signOut();

    return NextResponse.json({ ok: true, purgeAfter });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
