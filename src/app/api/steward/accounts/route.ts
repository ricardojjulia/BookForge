import { NextResponse } from "next/server";
import { listStewardAccounts } from "@/lib/accounts/steward-directory";
import { requireStaff } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { user, response } = await requireStaff(supabase);
  if (!user) return response;

  const { searchParams } = new URL(request.url);

  try {
    const result = await listStewardAccounts(createAdminClient(), {
      search: searchParams.get("search") || undefined,
      page: Number(searchParams.get("page")) || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Steward account list failed", error);
    return NextResponse.json({ error: "Unable to load accounts." }, { status: 500 });
  }
}
