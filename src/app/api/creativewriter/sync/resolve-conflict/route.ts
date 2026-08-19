import { NextResponse } from "next/server";
import { creativeWriterConflictResolutionSchema } from "@/lib/creativewriter-sync";
import { resolveCreativeWriterConflict } from "@/lib/creativewriter-sync/cloud-sync";
import { createClient } from "@/lib/supabase/server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to resolve CreativeWriter conflict.";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const body = creativeWriterConflictResolutionSchema.parse(await request.json());
    if (body.project.accountId !== user.id) {
      return NextResponse.json({ error: "Linked project account does not match authenticated user." }, { status: 403 });
    }

    const result = await resolveCreativeWriterConflict({ supabase, userId: user.id, request: body });
    return NextResponse.json({ content: result });
  } catch (error) {
    console.error("CreativeWriter conflict resolution failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
