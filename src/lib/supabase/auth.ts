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

function normalizeAuthError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error("Authentication required.");
}