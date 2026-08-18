import { NextResponse } from "next/server";
import { requestAccountDeletion } from "@/lib/accounts/deletion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

    const { purgeAfter } = await requestAccountDeletion(createAdminClient(), {
      userId: user.id,
      email: user.email || null,
      displayName: profile?.display_name || null,
    });

    // Session-scoped signOut as defense-in-depth: the client already calls this
    // too, this covers the case where the client-side call never fires (e.g. a
    // dropped connection right after this response resolves).
    await supabase.auth.signOut();

    return NextResponse.json({ ok: true, purgeAfter });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
