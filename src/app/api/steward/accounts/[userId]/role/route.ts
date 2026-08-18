import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  platformRole: z.enum(["steward"]).nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const supabase = await createClient();
  const { user, response } = await requireStaff(supabase);
  if (!user) return response;

  const { userId } = await params;
  if (userId === user.id) {
    return NextResponse.json({ error: "You cannot change your own Steward role." }, { status: 400 });
  }

  try {
    const body = schema.parse(await request.json());
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").upsert({ id: userId, platform_role: body.platformRole });
    if (error) throw error;

    return NextResponse.json({ ok: true, platformRole: body.platformRole });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request." }, { status: 400 });
    console.error("Steward role change failed", error);
    return NextResponse.json({ error: "Unable to change role." }, { status: 500 });
  }
}
