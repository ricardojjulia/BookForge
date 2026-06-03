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
  return "Unable to update revision review workflow.";
}

export async function PATCH(request: Request, context: { params: Promise<{ versionId: string }> }) {
  try {
    const { versionId } = await context.params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: version, error: versionError } = await supabase
      .from("revision_versions")
      .select("id,book_id,chapter_id,paragraph_id,review_status,reviewer_id")
      .eq("id", versionId)
      .single();
    if (versionError) throw versionError;

    const canManage = await canManageBookWorkflow(supabase, version.book_id, user.id);
    if (!canManage) {
      return NextResponse.json({ error: "You do not have permission to manage this review workflow." }, { status: 403 });
    }

    if (body.action === "assign" && !body.reviewerId) {
      return NextResponse.json({ error: "Reviewer is required when assigning." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updates: {
      reviewer_id?: string | null;
      review_assigned_by?: string | null;
      review_status?: ReviewWorkflowStatus;
      review_notes?: string | null;
      review_updated_at: string;
      review_decided_at?: string | null;
    } = {
      review_updated_at: now,
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

    const { data: updated, error: updateError } = await supabase
      .from("revision_versions")
      .update(updates)
      .eq("id", versionId)
      .select("id,book_id,reviewer_id,review_status,review_notes,review_updated_at")
      .single();
    if (updateError) throw updateError;

    if (body.action === "assign" && updates.reviewer_id) {
      await addCollaborationNotificationWithEmail(supabase, {
        bookId: version.book_id,
        recipientUserId: updates.reviewer_id,
        actorUserId: user.id,
        eventType: "revision_review_assigned",
        title: "Revision review assigned",
        body: `You were assigned to review revision ${version.id}.`,
        metadata: {
          revisionVersionId: version.id,
          chapterId: version.chapter_id,
          paragraphId: version.paragraph_id,
        },
      });
    }

    if (["approve", "request_changes"].includes(body.action) && version.reviewer_id && version.reviewer_id !== user.id) {
      await addCollaborationNotificationWithEmail(supabase, {
        bookId: version.book_id,
        recipientUserId: version.reviewer_id,
        actorUserId: user.id,
        eventType: body.action === "approve" ? "revision_review_approved" : "revision_review_changes_requested",
        title: body.action === "approve" ? "Revision approved" : "Revision needs changes",
        body:
          body.action === "approve"
            ? `Revision ${version.id} was approved.`
            : `Revision ${version.id} was sent back for changes.${note ? ` Note: ${note}` : ""}`,
        metadata: {
          revisionVersionId: version.id,
          chapterId: version.chapter_id,
          paragraphId: version.paragraph_id,
        },
      });
    }

    return NextResponse.json({ content: updated });
  } catch (error) {
    console.error("Revision review workflow update failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
