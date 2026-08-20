import { NextResponse } from "next/server";
import { getStewardPricingOverview } from "@/lib/subscription/pricing-overview";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { user, response } = await requireStaff(supabase);
  if (!user) return response;

  try {
    const result = await getStewardPricingOverview(createAdminClient());
    return NextResponse.json(result);
  } catch (error) {
    console.error("Steward pricing overview failed", error);
    return NextResponse.json({ error: "Unable to load pricing overview." }, { status: 500 });
  }
}
