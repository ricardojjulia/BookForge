export type RewriteCampaignStats = {
  totalParagraphs: number;
  untouchedParagraphs: number;
  pendingDraftParagraphs: number;
  acceptedParagraphs: number;
  sampledChapters: number;
  fullyCoveredChapters: number;
  totalChapters: number;
};

export type RewriteCampaignRow = {
  id: string;
  book_id: string;
  name: string;
  goal: "sample_all_chapters" | "full_coverage" | "custom";
  status: "active" | "running" | "paused" | "completed" | "cancelled" | "failed";
  strategy_id: string;
  strategy_settings: Record<string, unknown> | null;
  author_instructions: string | null;
  batch_size: number;
  distribute_across_chapters: boolean;
  rewrite_existing_drafts: boolean;
  rewrite_accepted: boolean;
  total_paragraphs: number;
  untouched_paragraphs: number;
  pending_draft_paragraphs: number;
  accepted_paragraphs: number;
  sampled_chapters: number;
  fully_covered_chapters: number;
  total_chapters: number;
  batches_run: number;
  last_revision_job_id: string | null;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function getRewriteCampaignStats({
  paragraphCount,
  pendingDraftParagraphCount,
  acceptedParagraphCount,
  rewriteCoverage,
}: {
  paragraphCount: number;
  pendingDraftParagraphCount: number;
  acceptedParagraphCount: number;
  rewriteCoverage: Array<{ totalParagraphs: number; rewrittenParagraphs: number }>;
}): RewriteCampaignStats {
  const totalChapters = rewriteCoverage.filter((chapter) => chapter.totalParagraphs > 0).length;
  const sampledChapters = rewriteCoverage.filter((chapter) => chapter.rewrittenParagraphs > 0).length;
  const fullyCoveredChapters = rewriteCoverage.filter(
    (chapter) => chapter.totalParagraphs > 0 && chapter.rewrittenParagraphs >= chapter.totalParagraphs,
  ).length;

  return {
    totalParagraphs: paragraphCount,
    untouchedParagraphs: Math.max(0, paragraphCount - pendingDraftParagraphCount - acceptedParagraphCount),
    pendingDraftParagraphs: pendingDraftParagraphCount,
    acceptedParagraphs: acceptedParagraphCount,
    sampledChapters,
    fullyCoveredChapters,
    totalChapters,
  };
}

export function isRewriteCampaignComplete(
  campaign: Pick<RewriteCampaignRow, "goal"> | { goal: string },
  stats: RewriteCampaignStats,
) {
  if (campaign.goal === "sample_all_chapters") {
    return stats.totalChapters > 0 && stats.sampledChapters >= stats.totalChapters;
  }
  if (campaign.goal === "full_coverage") {
    return stats.totalParagraphs > 0 && stats.untouchedParagraphs <= 0;
  }
  return false;
}
