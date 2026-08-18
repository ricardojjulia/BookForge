import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAuthenticatedUser(supabase: SupabaseClient) {
  try {
    const result = await supabase.auth.getUser();
    return { user: result.data.user, error: null as Error | null };
  } catch (error) {
    return { user: null, error: normalizeAuthError(error) };
  }
}

export function unauthorizedResponse(message = "Authentication required.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = "Forbidden.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

// The only gate for Steward (platform-staff) actions that go through the Auth
// Admin API (listUsers/updateUserById/deleteUser) -- those calls are entirely
// outside Postgres RLS, so unlike book-content routes this check is load-bearing,
// not defense-in-depth. Must be called in every steward/* route individually, not
// just the layout, since a layout-only check doesn't gate a direct API hit.
export async function requireStaff(supabase: SupabaseClient) {
  const { user, error } = await getAuthenticatedUser(supabase);
  if (error || !user) return { user: null, response: unauthorizedResponse() };

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.platform_role !== "steward") return { user: null, response: forbiddenResponse() };
  return { user, response: null as NextResponse | null };
}

function normalizeAuthError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error("Authentication required.");
}