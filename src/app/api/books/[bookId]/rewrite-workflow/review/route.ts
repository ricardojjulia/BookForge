import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addCollaborationNotificationWithEmail,
  canManageBookWorkflow,
  normalizeReviewNote,
  type ReviewWorkflowStatus,
} from "@/lib/collaboration/workflow";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  action: z.enum(["assign", "start", "approve", "request_changes", "unassign"]),
  reviewerId: z.string().uuid().optional(),
  note: z.string().max(2000).optional(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unable to update rewrite approval workflow.";
}

export async function PATCH(request: Request, context: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const canManage = await canManageBookWorkflow(supabase, bookId, user.id);
    if (!canManage) {
      return NextResponse.json({ error: "You do not have permission to manage rewrite approvals." }, { status: 403 });
    }

    if (body.action === "assign" && !body.reviewerId) {
      return NextResponse.json({ error: "Reviewer is required when assigning." }, { status: 400 });
    }

    const { data: existingWorkflow } = await supabase
      .from("rewrite_workflows")
      .select("id,reviewer_id,review_status")
      .eq("book_id", bookId)
      .maybeSingle();

    const now = new Date().toISOString();
    const updates: {
      book_id: string;
      owner_id: string;
      reviewer_id?: string | null;
      review_assigned_by?: string | null;
      review_status?: ReviewWorkflowStatus;
      review_notes?: string | null;
      review_updated_at: string;
      review_decided_at?: string | null;
      updated_at: string;
    } = {
      book_id: bookId,
      owner_id: user.id,
      review_updated_at: now,
      updated_at: now,
    };

    const note = normalizeReviewNote(body.note);
    if (note !== null) updates.review_notes = note;

    if (body.action === "assign") {
      updates.reviewer_id = body.reviewerId || null;
      updates.review_assigned_by = user.id;
      updates.review_status = "assigned";
      updates.review_decided_at = null;
    }
    if (body.action === "start") {
      updates.review_status = "in_review";
    }
    if (body.action === "approve") {
      updates.review_status = "approved";
      updates.review_decided_at = now;
    }
    if (body.action === "request_changes") {
      updates.review_status = "changes_requested";
      updates.review_decided_at = now;
    }
    if (body.action === "unassign") {
      updates.reviewer_id = null;
      updates.review_assigned_by = null;
      updates.review_status = "unassigned";
      updates.review_decided_at = null;
    }

    const { data: updated, error } = await supabase
      .from("rewrite_workflows")
      .upsert(updates, { onConflict: "book_id" })
      .select("id,book_id,reviewer_id,review_status,review_notes,review_updated_at")
      .single();
    if (error) throw error;

    if (body.action === "assign" && updates.reviewer_id) {
      await addCollaborationNotificationWithEmail(supabase, {
        bookId,
        recipientUserId: updates.reviewer_id,
        actorUserId: user.id,
        eventType: "rewrite_approval_assigned",
        title: "Rewrite approval assigned",
        body: "You were assigned to review and approve the rewrite strategy.",
        metadata: {
          workflowId: existingWorkflow?.id || updated.id,
          bookId,
        },
      });
    }

    if (["approve", "request_changes"].includes(body.action) && existingWorkflow?.reviewer_id && existingWorkflow.reviewer_id !== user.id) {
      await addCollaborationNotificationWithEmail(supabase, {
        bookId,
        recipientUserId: existingWorkflow.reviewer_id,
        actorUserId: user.id,
        eventType: body.action === "approve" ? "rewrite_approval_approved" : "rewrite_approval_changes_requested",
        title: body.action === "approve" ? "Rewrite strategy approved" : "Rewrite strategy changes requested",
        body:
          body.action === "approve"
            ? "The rewrite strategy has been approved."
            : `Changes were requested for rewrite strategy approval.${note ? ` Note: ${note}` : ""}`,
        metadata: {
          workflowId: existingWorkflow?.id || updated.id,
          bookId,
        },
      });
    }

    return NextResponse.json({ content: updated });
  } catch (error) {
    console.error("Rewrite review workflow update failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
