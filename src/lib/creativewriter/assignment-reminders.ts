import type { createAdminClient } from "@/lib/supabase/admin";
import { deliverCollaborationNotificationEmail } from "@/lib/collaboration/workflow";

type ReminderSupabase = ReturnType<typeof createAdminClient>;
type ClaimedReminder = {
  notification_id: string;
  book_id: string;
  recipient_user_id: string;
  title: string;
  body: string;
  has_more: boolean;
};

const REMINDER_WINDOW_MS = 72 * 60 * 60 * 1000;
const REMINDER_BATCH_SIZE = 100;
const EMAIL_CONCURRENCY = 10;

export async function dispatchCreativeWriterAssignmentReminders(
  supabase: ReminderSupabase,
  now = new Date(),
) {
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_MS);
  const { data, error } = await supabase.rpc("claim_creativewriter_assignment_due_reminders", {
    p_now: now.toISOString(),
    p_horizon: horizon.toISOString(),
    p_limit: REMINDER_BATCH_SIZE,
  });
  if (error) throw error;

  const reminders = (data || []) as ClaimedReminder[];
  let emailsSent = 0;
  for (let index = 0; index < reminders.length; index += EMAIL_CONCURRENCY) {
    const results = await Promise.all(reminders.slice(index, index + EMAIL_CONCURRENCY).map((reminder) =>
      deliverCollaborationNotificationEmail(supabase as never, reminder.notification_id, {
        bookId: reminder.book_id,
        recipientUserId: reminder.recipient_user_id,
        actorUserId: null,
        title: reminder.title,
        body: reminder.body,
      }),
    ));
    emailsSent += results.filter((outcome) => outcome === "sent").length;
  }

  const notified = reminders.length;
  return { notified, emailsSent, hasMore: reminders.some((reminder) => reminder.has_more) };
}