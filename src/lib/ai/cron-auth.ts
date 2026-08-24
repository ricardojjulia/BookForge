import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type RequestAuth = { supabase: SupabaseClient; userId: string | null };

function isValidCronSecret(header: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !header) return false;
  const receivedBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(`Bearer ${expected}`);
  return receivedBuf.length === expectedBuf.length && timingSafeEqual(receivedBuf, expectedBuf);
}

/**
 * rewrite-execute and generate-draft normally authenticate via the caller's
 * session cookie -- fine for a browser or the auto-review orchestrator
 * (which forwards a real cookie), but a scheduled resume-stale-chunked-jobs
 * cron has no user session to forward at all. Accepts a second, narrow auth
 * path instead: a valid CRON_SECRET bearer token (same header the existing
 * pricing-refresh/account-purge internal routes already require) plus an
 * explicit acting-user id, which the cron already knows from the stale
 * job's own created_by column. Falls back to normal cookie auth otherwise --
 * this never widens what a browser request can do, it only lets the one
 * trusted internal caller stand in for the job's real owner.
 *
 * Uses the admin (service-role) client for the cron path, since there's no
 * session for RLS to key off; every subsequent query in the route already
 * filters explicitly by book_id/created_by/user_id regardless of client
 * type, so this doesn't relax any of the route's own authorization checks.
 */
export async function resolveRequestAuth(request: Request, actingUserId?: string): Promise<RequestAuth> {
  if (actingUserId && isValidCronSecret(request.headers.get("authorization"))) {
    return { supabase: createAdminClient(), userId: actingUserId };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}
