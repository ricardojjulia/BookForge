import type { createClient } from "@/lib/supabase/server";
import { sendWorkflowNotification } from "@/lib/email";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ReviewWorkflowStatus = "unassigned" | "assigned" | "in_review" | "approved" | "changes_requested";

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
  },
) {
  const { error } = await supabase.from("collaboration_notifications").insert({
    book_id: input.bookId,
    recipient_user_id: input.recipientUserId,
    actor_user_id: input.actorUserId || null,
    event_type: input.eventType,
    title: input.title,
    body: input.body,
    metadata: input.metadata || {},
  });
  if (error) {
    console.error("Unable to write collaboration notification", error);
  }
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
  },
) {
  await addCollaborationNotification(supabase, input);

  const [{ data: recipient }, { data: actorProfile }, { data: book }] = await Promise.all([
    supabase.from("profiles").select("email,display_name").eq("id", input.recipientUserId).maybeSingle(),
    input.actorUserId
      ? supabase.from("profiles").select("display_name,email").eq("id", input.actorUserId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("books").select("title").eq("id", input.bookId).maybeSingle(),
  ]);

  const toEmail = recipient?.email || "";
  if (!toEmail) return;

  await sendWorkflowNotification({
    toEmail,
    bookTitle: book?.title || "BookForge manuscript",
    title: input.title,
    body: input.body,
    actorLabel: actorProfile?.display_name || actorProfile?.email || "A collaborator",
  });
}

export function normalizeReviewNote(note: string | undefined) {
  if (typeof note !== "string") return null;
  const trimmed = note.trim();
  return trimmed.length ? trimmed : null;
}

export function isAllowedReviewStatus(value: string): value is ReviewWorkflowStatus {
  return ["unassigned", "assigned", "in_review", "approved", "changes_requested"].includes(value);
}
