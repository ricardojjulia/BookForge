import { NextResponse } from "next/server";
import { extractCriticScore } from "@/lib/critic/score";
import { createClient } from "@/lib/supabase/server";

const CRITIC_LENSES = [
  "story_structure",
  "prose_quality",
  "continuity",
  "character_depth",
  "market_fit",
  "theology_worldview",
  "revision_priorities",
] as const;

const GREEN_THRESHOLD = 70;

export async function GET(_: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    // Find the most recent report for each lens (post-rewrite = critic_post:{lens}, baseline = critic:{lens})
    const { data: allReports } = await supabase
      .from("coherence_reports")
      .select("report_type,content,created_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false });

    const reports = allReports || [];

    const scoresByLens: Record<string, number | null> = {};
    for (const lens of CRITIC_LENSES) {
      const postReport = reports.find((r) => r.report_type === `critic_post:${lens}`);
      scoresByLens[lens] = postReport
        ? extractCriticScore(postReport.content as Record<string, unknown> | null)
        : null;
    }

    const baselineScores: Record<string, number | null> = {};
    for (const lens of CRITIC_LENSES) {
      const baselineReport = reports.find((r) => r.report_type === `critic:${lens}`);
      baselineScores[lens] = baselineReport
        ? extractCriticScore(baselineReport.content as Record<string, unknown> | null)
        : null;
    }

    const scores = scoresByLens;
    const scoresWithValues = Object.values(scores).filter((s): s is number => s !== null);
    const greenCount = scoresWithValues.filter((s) => s >= GREEN_THRESHOLD).length;
    const allGreen = scoresWithValues.length >= CRITIC_LENSES.length &&
      scoresWithValues.every((s) => s >= GREEN_THRESHOLD);
    const avgScore = scoresWithValues.length
      ? Math.round(scoresWithValues.reduce((a, b) => a + b, 0) / scoresWithValues.length)
      : null;

    return NextResponse.json({
      allGreen,
      greenCount,
      total: CRITIC_LENSES.length,
      scores: scoresByLens,
      baselineScores,
      avgScore,
      threshold: GREEN_THRESHOLD,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
