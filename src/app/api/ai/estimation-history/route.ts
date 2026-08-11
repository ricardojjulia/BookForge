import { NextResponse } from "next/server";
import { getHistoricalSecondsPerUnit } from "@/lib/ai/estimation-history";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TASKS = new Set([
  "manuscript_blueprint",
  "chapter_summaries",
  "bookforge_critic",
  "bookforge_critic_batch",
  "creation_draft_generation",
  "world_bible_discovery",
]);

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const task = new URL(request.url).searchParams.get("task") || "";
  if (!ALLOWED_TASKS.has(task)) {
    return NextResponse.json({ content: { estimate: null } });
  }

  try {
    const estimate = await getHistoricalSecondsPerUnit(task);
    return NextResponse.json({ content: { estimate } });
  } catch (error) {
    console.warn("Historical estimate lookup failed", error);
    return NextResponse.json({ content: { estimate: null } });
  }
}
