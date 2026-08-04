import type { createAdminClient } from "@/lib/supabase/admin";
import { deliverCollaborationNotificationEmail, type CollaborationEmailOutcome } from "@/lib/collaboration/workflow";

type AdminSupabase = ReturnType<typeof createAdminClient>;
type ClaimedEmailDelivery = {
  notification_id: string;
  book_id: string;
  recipient_user_id: string;
  actor_user_id: string | null;
  title: string;
  body: string;
  claim_token: string;
  has_more: boolean;
};

const RETRY_BATCH_SIZE = 50;
const EMAIL_CONCURRENCY = 10;

export async function dispatchCollaborationNotificationEmailRetries(
  supabase: AdminSupabase,
  now = new Date(),
) {
  const { data, error } = await supabase.rpc("claim_collaboration_notification_email_retries", {
    p_now: now.toISOString(),
    p_limit: RETRY_BATCH_SIZE,
  });
  if (error) throw error;

  const deliveries = (data || []) as ClaimedEmailDelivery[];
  const outcomes: CollaborationEmailOutcome[] = [];
  for (let index = 0; index < deliveries.length; index += EMAIL_CONCURRENCY) {
    outcomes.push(...await Promise.all(deliveries.slice(index, index + EMAIL_CONCURRENCY).map((delivery) =>
      deliverCollaborationNotificationEmail(supabase as never, delivery.notification_id, {
        bookId: delivery.book_id,
        recipientUserId: delivery.recipient_user_id,
        actorUserId: delivery.actor_user_id,
        title: delivery.title,
        body: delivery.body,
      }, delivery.claim_token),
    )));
  }

  return {
    claimed: deliveries.length,
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    skipped: outcomes.filter((outcome) => outcome === "skipped").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    hasMore: deliveries.some((delivery) => delivery.has_more),
  };
}