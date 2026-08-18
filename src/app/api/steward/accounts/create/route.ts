import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { user, response } = await requireStaff(supabase);
  if (!user) return response;

  try {
    const body = schema.parse(await request.json());
    const admin = createAdminClient();

    const { data, error } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (error) throw error;

    if (body.displayName) {
      const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, display_name: body.displayName });
      if (profileError) throw profileError;
    }

    return NextResponse.json({ ok: true, id: data.user.id, email: data.user.email });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request." }, { status: 400 });
    console.error("Steward account create failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create account." }, { status: 500 });
  }
}
