import { NextResponse } from "next/server";
import { z } from "zod";
import { rewriteStrategies } from "@/lib/rewrite/strategies";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120).default("Full-book rewrite campaign"),
  goal: z.enum(["sample_all_chapters", "full_coverage", "custom"]).default("full_coverage"),
  strategyId: z.string().default("humanized_literary"),
  strategySettings: z.record(z.string(), z.unknown()).default({}),
  authorInstructions: z.string().max(3000).optional(),
  batchSize: z.number().int().positive().max(5000).default(25),
  distributeAcrossChapters: z.boolean().default(true),
  rewriteExistingDrafts: z.boolean().default(false),
  rewriteAccepted: z.boolean().default(false),
  stats: z
    .object({
      totalParagraphs: z.number().int().nonnegative().default(0),
      untouchedParagraphs: z.number().int().nonnegative().default(0),
      pendingDraftParagraphs: z.number().int().nonnegative().default(0),
      acceptedParagraphs: z.number().int().nonnegative().default(0),
      sampledChapters: z.number().int().nonnegative().default(0),
      fullyCoveredChapters: z.number().int().nonnegative().default(0),
      totalChapters: z.number().int().nonnegative().default(0),
    })
    .optional(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to create rewrite campaign.";
}

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const body = createSchema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const strategy = rewriteStrategies[body.strategyId as keyof typeof rewriteStrategies] || rewriteStrategies.humanized_literary;
    const { data, error } = await supabase
      .from("rewrite_campaigns")
      .insert({
        book_id: bookId,
        created_by: user.id,
        name: body.name,
        goal: body.goal,
        status: "active",
        strategy_id: strategy.id,
        strategy_settings: body.strategySettings,
        author_instructions: body.authorInstructions || null,
        batch_size: body.batchSize,
        distribute_across_chapters: body.distributeAcrossChapters,
        rewrite_existing_drafts: body.rewriteExistingDrafts,
        rewrite_accepted: body.rewriteAccepted,
        total_paragraphs: body.stats?.totalParagraphs || 0,
        untouched_paragraphs: body.stats?.untouchedParagraphs || 0,
        pending_draft_paragraphs: body.stats?.pendingDraftParagraphs || 0,
        accepted_paragraphs: body.stats?.acceptedParagraphs || 0,
        sampled_chapters: body.stats?.sampledChapters || 0,
        fully_covered_chapters: body.stats?.fullyCoveredChapters || 0,
        total_chapters: body.stats?.totalChapters || 0,
        started_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ content: { campaign: data } });
  } catch (error) {
    console.error("Create rewrite campaign failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
