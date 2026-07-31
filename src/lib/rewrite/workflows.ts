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
  reviewer_id: string | null;
  review_assigned_by: string | null;
  review_status: "unassigned" | "assigned" | "in_review" | "approved" | "changes_requested";
  review_notes: string | null;
  review_updated_at: string | null;
  review_decided_at: string | null;
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
    reviewer_id: null,
    review_assigned_by: null,
    review_status: "unassigned",
    review_notes: null,
    review_updated_at: null,
    review_decided_at: null,
    metadata: {},
    created_at: now,
    updated_at: now,
  };
}
