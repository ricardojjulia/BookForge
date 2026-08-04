import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchCollaborationNotificationEmailRetries } from "@/lib/collaboration/email-retries";

const { deliverEmailMock } = vi.hoisted(() => ({ deliverEmailMock: vi.fn() }));

vi.mock("@/lib/collaboration/workflow", () => ({
  deliverCollaborationNotificationEmail: deliverEmailMock,
}));

describe("collaboration notification email retry dispatcher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims retryable deliveries and reports each terminal outcome", async () => {
    const deliveries = [delivery("notification-1"), delivery("notification-2"), delivery("notification-3", true)];
    const supabase = { rpc: vi.fn(async () => ({ data: deliveries, error: null })) };
    deliverEmailMock.mockResolvedValueOnce("sent").mockResolvedValueOnce("skipped").mockResolvedValueOnce("failed");

    await expect(dispatchCollaborationNotificationEmailRetries(supabase as never, new Date("2026-08-04T15:00:00.000Z"))).resolves.toEqual({
      claimed: 3,
      sent: 1,
      skipped: 1,
      failed: 1,
      hasMore: true,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("claim_collaboration_notification_email_retries", {
      p_now: "2026-08-04T15:00:00.000Z",
      p_limit: 50,
    });
    expect(deliverEmailMock).toHaveBeenCalledTimes(3);
    expect(deliverEmailMock).toHaveBeenCalledWith(supabase, "notification-1", expect.any(Object), "claim-notification-1");
  });

  it("propagates claim failures before attempting delivery", async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: new Error("Database unavailable") })) };

    await expect(dispatchCollaborationNotificationEmailRetries(supabase as never)).rejects.toThrow("Database unavailable");
    expect(deliverEmailMock).not.toHaveBeenCalled();
  });
});

function delivery(notificationId: string, hasMore = false) {
  return {
    notification_id: notificationId,
    book_id: "book-1",
    recipient_user_id: "reader-1",
    actor_user_id: "editor-1",
    title: "Contributor assignment due soon",
    body: "Assignment due soon: Review the draft",
    claim_token: `claim-${notificationId}`,
    has_more: hasMore,
  };
}