import { NextResponse } from "next/server";
import { z } from "zod";
import { pullCreativeWriterSync } from "@/lib/creativewriter-sync/cloud-sync";
import { createClient } from "@/lib/supabase/server";

const linkSchema = z.object({
  bookId: z.string().min(1),
  localProjectId: z.string().min(1).optional(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to link CreativeWriter project.";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const body = linkSchema.parse(await request.json());
    const pull = await pullCreativeWriterSync({
      supabase,
      userId: user.id,
      bookId: body.bookId,
      localProjectId: body.localProjectId,
    });

    return NextResponse.json({ content: pull });
  } catch (error) {
    console.error("CreativeWriter sync link failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
