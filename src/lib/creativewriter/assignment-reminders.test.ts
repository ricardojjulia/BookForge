import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchCreativeWriterAssignmentReminders } from "@/lib/creativewriter/assignment-reminders";

const { deliverNotificationEmailMock } = vi.hoisted(() => ({ deliverNotificationEmailMock: vi.fn() }));

vi.mock("@/lib/collaboration/workflow", () => ({
  deliverCollaborationNotificationEmail: deliverNotificationEmailMock,
}));

describe("CreativeWriter assignment reminder dispatcher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims the active 72-hour window and reports in-app and optional email delivery", async () => {
    const reminders = [
      reminder("notification-1"),
      reminder("notification-2"),
    ];
    const supabase = { rpc: vi.fn(async () => ({ data: reminders, error: null })) };
    deliverNotificationEmailMock.mockResolvedValueOnce("sent").mockResolvedValueOnce("failed");
    const now = new Date("2026-08-04T12:00:00.000Z");

    await expect(dispatchCreativeWriterAssignmentReminders(supabase as never, now)).resolves.toEqual({
      notified: 2,
      emailsSent: 1,
      hasMore: false,
    });

    expect(supabase.rpc).toHaveBeenCalledWith("claim_creativewriter_assignment_due_reminders", {
      p_now: "2026-08-04T12:00:00.000Z",
      p_horizon: "2026-08-07T12:00:00.000Z",
      p_limit: 100,
    });
    expect(deliverNotificationEmailMock).toHaveBeenCalledTimes(2);
  });

  it("reports database continuation state for a full batch", async () => {
    const reminders = Array.from({ length: 100 }, (_, index) => reminder(`notification-${index}`, true));
    const supabase = { rpc: vi.fn(async () => ({ data: reminders, error: null })) };
    deliverNotificationEmailMock.mockResolvedValue("sent");

    await expect(dispatchCreativeWriterAssignmentReminders(supabase as never)).resolves.toEqual({
      notified: 100,
      emailsSent: 100,
      hasMore: true,
    });
    expect(deliverNotificationEmailMock).toHaveBeenCalledTimes(100);
  });

  it("propagates assignment scan failures", async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: new Error("Database unavailable") })) };

    await expect(dispatchCreativeWriterAssignmentReminders(supabase as never)).rejects.toThrow("Database unavailable");
    expect(deliverNotificationEmailMock).not.toHaveBeenCalled();
  });
});

function reminder(id: string, hasMore = false) {
  return {
    notification_id: id,
    book_id: "book-1",
    recipient_user_id: "reader-1",
    title: "Contributor assignment due soon",
    body: "Assignment due soon: Review the draft",
    has_more: hasMore,
  };
}