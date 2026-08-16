import { NextResponse } from "next/server";
import { getBookCriticReports } from "@/lib/books/book-data";
import { criticLenses } from "@/lib/critic/prompts";
import { extractCriticScore } from "@/lib/critic/score";
import { createClient } from "@/lib/supabase/server";
import type { CriticLens } from "@/lib/types";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unable to load critic scores.";
}

// The latest score per lens, whichever report type (baseline or
// post-rewrite) is freshest -- same "latest wins" rule CriticScoreboard
// renders with, exposed as JSON so client components (e.g. showing a
// before/after delta after a rewrite) don't need their own report feed.
export async function GET(_: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { reports } = await getBookCriticReports(supabase, bookId, { scope: "all", limit: 80 });

    const latestByLens = new Map<CriticLens, { created_at: string; content: Record<string, unknown> | null }>();
    for (const report of reports) {
      const lens = report.report_type.replace(/^critic(?:_post)?:/, "") as CriticLens;
      if (!(lens in criticLenses)) continue;
      const existing = latestByLens.get(lens);
      if (!existing || Date.parse(report.created_at) > Date.parse(existing.created_at)) {
        latestByLens.set(lens, { created_at: report.created_at, content: report.content });
      }
    }

    const scores: Partial<Record<CriticLens, number | null>> = {};
    for (const [lens, report] of latestByLens) {
      scores[lens] = extractCriticScore(report.content);
    }

    return NextResponse.json({ content: { scores } });
  } catch (error) {
    console.error("Loading critic scores failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
