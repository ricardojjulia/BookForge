import type { createClient } from "@/lib/supabase/server";
import { addCollaborationNotificationWithEmail } from "@/lib/collaboration/workflow";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AssignmentNotificationSnapshot = {
  id: string;
  book_id: string;
  chapter_id: string | null;
  paragraph_id: string | null;
  assignee_id: string;
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  title: string;
  note: string | null;
  due_at: string | null;
};

type AssignmentNotification = {
  recipientUserId: string;
  eventType: string;
  title: string;
  body: string;
  dedupeKey?: string;
};

const DUE_SOON_WINDOW_MS = 72 * 60 * 60 * 1000;

export async function notifyAssignmentCreated(
  supabase: SupabaseClient,
  assignment: AssignmentNotificationSnapshot,
  actorUserId: string,
  now = new Date(),
) {
  await sendAssignmentNotifications(supabase, assignment, actorUserId, [
    {
      recipientUserId: assignment.assignee_id,
      eventType: "creativewriter_assignment_created",
      title: "Contributor assignment created",
      body: `You were assigned: ${assignment.title}`,
    },
    ...dueSoonNotification(assignment, now),
  ]);
}

export async function notifyAssignmentUpdated(
  supabase: SupabaseClient,
  previous: AssignmentNotificationSnapshot,
  assignment: AssignmentNotificationSnapshot,
  actorUserId: string,
  now = new Date(),
) {
  const notifications: AssignmentNotification[] = [];
  const reassigned = previous.assignee_id !== assignment.assignee_id;
  const cancelled = previous.status !== "cancelled" && assignment.status === "cancelled";
  const detailsChanged = assignmentDetailsChanged(previous, assignment);
  const dueDateChanged = previous.due_at !== assignment.due_at;

  if (reassigned) {
    notifications.push(
      {
        recipientUserId: previous.assignee_id,
        eventType: "creativewriter_assignment_removed",
        title: "Contributor assignment reassigned",
        body: `You are no longer assigned: ${previous.title}`,
      },
      {
        recipientUserId: assignment.assignee_id,
        eventType: "creativewriter_assignment_reassigned",
        title: "Contributor assignment reassigned",
        body: `You were assigned: ${assignment.title}`,
      },
    );
  } else if (cancelled) {
    notifications.push({
      recipientUserId: assignment.assignee_id,
      eventType: "creativewriter_assignment_cancelled",
      title: "Contributor assignment cancelled",
      body: `Assignment cancelled: ${assignment.title}`,
    });
  } else if (detailsChanged) {
    notifications.push({
      recipientUserId: assignment.assignee_id,
      eventType: "creativewriter_assignment_changed",
      title: "Contributor assignment changed",
      body: `Assignment details changed: ${assignment.title}`,
    });
  }

  if (dueDateChanged) notifications.push(...dueSoonNotification(assignment, now));
  await sendAssignmentNotifications(supabase, assignment, actorUserId, notifications);
}

export async function notifyAssignmentDueSoon(
  supabase: SupabaseClient,
  assignment: AssignmentNotificationSnapshot,
  now = new Date(),
) {
  return sendAssignmentNotifications(supabase, assignment, null, dueSoonNotification(assignment, now));
}

function assignmentDetailsChanged(previous: AssignmentNotificationSnapshot, assignment: AssignmentNotificationSnapshot) {
  return previous.title !== assignment.title
    || previous.note !== assignment.note
    || previous.due_at !== assignment.due_at
    || previous.chapter_id !== assignment.chapter_id
    || previous.paragraph_id !== assignment.paragraph_id;
}

function dueSoonNotification(assignment: AssignmentNotificationSnapshot, now: Date): AssignmentNotification[] {
  if (!assignment.due_at || assignment.status === "completed" || assignment.status === "cancelled") return [];
  const timeUntilDue = new Date(assignment.due_at).getTime() - now.getTime();
  if (timeUntilDue < 0 || timeUntilDue > DUE_SOON_WINDOW_MS) return [];
  return [{
    recipientUserId: assignment.assignee_id,
    eventType: "creativewriter_assignment_due_soon",
    title: "Contributor assignment due soon",
    body: `Assignment due soon: ${assignment.title}`,
    dedupeKey: `creativewriter-assignment-due:${assignment.id}:${new Date(assignment.due_at).toISOString()}`,
  }];
}

async function sendAssignmentNotifications(
  supabase: SupabaseClient,
  assignment: AssignmentNotificationSnapshot,
  actorUserId: string | null,
  notifications: AssignmentNotification[],
) {
  const results = await Promise.allSettled(notifications.map((notification) =>
    addCollaborationNotificationWithEmail(supabase, {
      bookId: assignment.book_id,
      recipientUserId: notification.recipientUserId,
      actorUserId,
      eventType: notification.eventType,
      title: notification.title,
      body: notification.body,
      dedupeKey: notification.dedupeKey,
      metadata: {
        assignmentId: assignment.id,
        chapterId: assignment.chapter_id,
        paragraphId: assignment.paragraph_id,
        dueAt: assignment.due_at,
      },
    }),
  ));
  for (const result of results) {
    if (result.status === "rejected") console.error("Unable to deliver assignment notification", result.reason);
  }
  return results.filter((result) => result.status === "fulfilled" && result.value === true).length;
}