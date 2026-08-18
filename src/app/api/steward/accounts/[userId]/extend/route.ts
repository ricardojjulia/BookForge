import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  extendByDays: z.number().int().min(1).max(365).default(14),
});

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const supabase = await createClient();
  const { user, response } = await requireStaff(supabase);
  if (!user) return response;

  const { userId } = await params;

  try {
    const body = schema.parse(await request.json().catch(() => ({})));
    const admin = createAdminClient();

    const { data: existing, error: findError } = await admin
      .from("account_deletion_requests")
      .select("id, purge_after")
      .eq("user_id", userId)
      .in("status", ["pending", "ready_for_purge"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) return NextResponse.json({ error: "No active deletion request for this account." }, { status: 404 });

    const currentPurgeAfter = new Date(existing.purge_after);
    const base = currentPurgeAfter > new Date() ? currentPurgeAfter : new Date();
    const purgeAfter = new Date(base.getTime() + body.extendByDays * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await admin
      .from("account_deletion_requests")
      .update({ purge_after: purgeAfter, status: "pending" })
      .eq("id", existing.id);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, purgeAfter });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request." }, { status: 400 });
    console.error("Steward account extend failed", error);
    return NextResponse.json({ error: "Unable to extend the retention window." }, { status: 500 });
  }
}
