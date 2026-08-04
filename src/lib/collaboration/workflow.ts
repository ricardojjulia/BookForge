import type { createClient } from "@/lib/supabase/server";
import { sendWorkflowNotification } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ReviewWorkflowStatus = "unassigned" | "assigned" | "in_review" | "approved" | "changes_requested";
export type CollaborationEmailOutcome = "sent" | "skipped" | "failed";

export async function canManageBookWorkflow(supabase: SupabaseClient, bookId: string, userId: string) {
  const { data: book } = await supabase.from("books").select("owner_id").eq("id", bookId).maybeSingle();
  if (!book) return false;
  if (book.owner_id === userId) return true;

  const { data: membership } = await supabase
    .from("book_collaborators")
    .select("role")
    .eq("book_id", bookId)
    .eq("user_id", userId)
    .maybeSingle();
  return membership?.role === "editor" || membership?.role === "admin";
}

export async function addCollaborationNotification(
  supabase: SupabaseClient,
  input: {
    bookId: string;
    recipientUserId: string;
    actorUserId?: string | null;
    eventType: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
    dedupeKey?: string;
  },
) {
  const { data, error } = await supabase
    .from("collaboration_notifications")
    .insert({
      book_id: input.bookId,
      recipient_user_id: input.recipientUserId,
      actor_user_id: input.actorUserId || null,
      event_type: input.eventType,
      title: input.title,
      body: input.body,
      metadata: input.metadata || {},
      ...(input.dedupeKey ? { dedupe_key: input.dedupeKey } : {}),
    })
    .select("id")
    .single();
  if (error && input.dedupeKey && "code" in error && error.code === "23505") return false;
  if (error) {
    console.error("Unable to write collaboration notification", error);
    return false;
  }
  return data?.id || false;
}

export async function addCollaborationNotificationWithEmail(
  supabase: SupabaseClient,
  input: {
    bookId: string;
    recipientUserId: string;
    actorUserId?: string | null;
    eventType: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
    dedupeKey?: string;
  },
) {
  const notificationId = await addCollaborationNotification(supabase, input);
  if (!notificationId) return false;
  await deliverCollaborationNotificationEmail(supabase, notificationId, input);
  return true;
}

export async function deliverCollaborationNotificationEmail(
  supabase: SupabaseClient,
  notificationId: string,
  input: Parameters<typeof sendCollaborationNotificationEmail>[1],
  claimToken: string | null = null,
) {
  const outcome = await sendCollaborationNotificationEmail(supabase, input, notificationId);
  try {
    const { data, error } = await createAdminClient().rpc("complete_collaboration_notification_email", {
      p_notification_id: notificationId,
      p_outcome: outcome,
      p_error: outcome === "failed" ? "Email provider delivery failed" : null,
      p_claim_token: claimToken,
    });
    if (error) console.error("Unable to update collaboration notification email delivery", error);
    else if (!data) console.error("Collaboration notification email delivery lease is no longer active", notificationId);
  } catch (error) {
    console.error("Unable to update collaboration notification email delivery", error);
  }
  return outcome;
}

export async function sendCollaborationNotificationEmail(
  supabase: SupabaseClient,
  input: {
    bookId: string;
    recipientUserId: string;
    actorUserId?: string | null;
    title: string;
    body: string;
  },
  notificationId?: string,
): Promise<CollaborationEmailOutcome> {
  try {
    const [{ data: recipient }, { data: actorProfile }, { data: book }] = await Promise.all([
      supabase.from("profiles").select("email,display_name").eq("id", input.recipientUserId).maybeSingle(),
      input.actorUserId
        ? supabase.from("profiles").select("display_name,email").eq("id", input.actorUserId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("books").select("title").eq("id", input.bookId).maybeSingle(),
    ]);

    const toEmail = recipient?.email || "";
    if (!toEmail) return "skipped";

    const result = await sendWorkflowNotification({
      toEmail,
      bookTitle: book?.title || "BookForge manuscript",
      title: input.title,
      body: input.body,
      actorLabel: input.actorUserId
        ? actorProfile?.display_name || actorProfile?.email || "A collaborator"
        : "BookForge",
      idempotencyKey: notificationId ? `collaboration-notification-${notificationId}` : undefined,
    });
    return result.sent ? "sent" : "skipped";
  } catch (error) {
    console.error("Unable to send collaboration notification email", error);
    return "failed";
  }
}

export function normalizeReviewNote(note: string | undefined) {
  if (typeof note !== "string") return null;
  const trimmed = note.trim();
  return trimmed.length ? trimmed : null;
}

export function isAllowedReviewStatus(value: string): value is ReviewWorkflowStatus {
  return ["unassigned", "assigned", "in_review", "approved", "changes_requested"].includes(value);
}
