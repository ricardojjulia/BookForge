import type { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

// Flags accounts past their retention window as ready for a Steward to review --
// it never purges anything itself. A plain UPDATE is sufficient (rather than a
// claim/lock RPC): the WHERE clause already only matches status = 'pending' rows,
// so Postgres's normal row-level locking makes a concurrent second run of this
// job a no-op (it finds nothing left to flip), with no separate claim step needed.
export async function flagAccountsReadyForPurge(supabase: AdminSupabase, now = new Date()) {
  const { data, error } = await supabase
    .from("account_deletion_requests")
    .update({ status: "ready_for_purge" })
    .eq("status", "pending")
    .lte("purge_after", now.toISOString())
    .select("id, user_id, email_at_request");
  if (error) throw error;

  return { flagged: (data || []).length };
}
