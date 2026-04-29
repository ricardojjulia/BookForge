export type RewriteWorkflowMode = "chooser" | "wizard" | "manual";

export type RewriteWorkflowRow = {
  id: string;
  book_id: string;
  owner_id: string | null;
  mode: RewriteWorkflowMode;
  current_step: number;
  strategy_approved: boolean;
  sample_revision_job_id: string | null;
  campaign_id: string | null;
  last_drift_report_id: string | null;
  post_critic_completed: boolean;
  export_ready: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export function getDefaultRewriteWorkflow(bookId: string): RewriteWorkflowRow {
  const now = new Date().toISOString();
  return {
    id: "",
    book_id: bookId,
    owner_id: null,
    mode: "chooser",
    current_step: 1,
    strategy_approved: false,
    sample_revision_job_id: null,
    campaign_id: null,
    last_drift_report_id: null,
    post_critic_completed: false,
    export_ready: false,
    metadata: {},
    created_at: now,
    updated_at: now,
  };
}
