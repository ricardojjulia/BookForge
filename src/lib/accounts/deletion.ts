import type { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabase = ReturnType<typeof createAdminClient>;

const RETENTION_DAYS = 30;

// Shared by both self-service deletion (/api/account/delete) and
// staff-initiated deletion (/api/steward/accounts/[userId]/delete): bans
// rather than deletes, so every book/chapter/paragraph/revision the user
// owns survives untouched. A Steward can restore within the retention
// window; nothing is permanently destroyed until an explicit, separate
// purge action.
export async function requestAccountDeletion(
  admin: AdminSupabase,
  input: { userId: string; email: string | null; displayName: string | null },
) {
  const { error: banError } = await admin.auth.admin.updateUserById(input.userId, { ban_duration: `${RETENTION_DAYS * 24}h` });
  if (banError) throw banError;

  const purgeAfter = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: trackingError } = await admin.from("account_deletion_requests").insert({
    user_id: input.userId,
    email_at_request: input.email,
    display_name_at_request: input.displayName,
    purge_after: purgeAfter,
  });
  if (trackingError) throw trackingError;

  return { purgeAfter };
}
