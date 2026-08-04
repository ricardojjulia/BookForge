import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addCollaborationNotificationWithEmail } from "@/lib/collaboration/workflow";

const { adminRpcMock, sendWorkflowNotificationMock } = vi.hoisted(() => ({
  adminRpcMock: vi.fn(),
  sendWorkflowNotificationMock: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendWorkflowNotification: sendWorkflowNotificationMock,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: adminRpcMock }),
}));

describe("collaboration workflow notifications", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("keeps email-provider failures from failing the workflow mutation", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendWorkflowNotificationMock.mockRejectedValueOnce(new Error("Email provider unavailable"));
    const inserted: unknown[] = [];
    adminRpcMock.mockResolvedValueOnce({ data: true, error: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "collaboration_notifications") {
          const query = {
            insert: vi.fn((payload: unknown) => { inserted.push(payload); return query; }),
            select: vi.fn(() => query),
            single: vi.fn(async () => ({ data: { id: "notification-1" }, error: null })),
          };
          return query;
        }
        const row = table === "profiles"
          ? { email: "reader@example.com", display_name: "Reader" }
          : { title: "The Forge" };
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: row, error: null })),
        };
        return query;
      }),
    };

    await expect(addCollaborationNotificationWithEmail(supabase as never, {
      bookId: "book-1",
      recipientUserId: "reader-1",
      actorUserId: "editor-1",
      eventType: "creativewriter_assignment_created",
      title: "Contributor assignment created",
      body: "You were assigned: Review the opening",
    })).resolves.toBe(true);

    expect(inserted).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledWith("Unable to send collaboration notification email", expect.any(Error));
    expect(adminRpcMock).toHaveBeenCalledWith("complete_collaboration_notification_email", {
      p_notification_id: "notification-1",
      p_outcome: "failed",
      p_error: "Email provider delivery failed",
      p_claim_token: null,
    });
  });

  it("suppresses duplicate notification email after a database uniqueness conflict", async () => {
    sendWorkflowNotificationMock.mockClear();
    const supabase = {
      rpc: vi.fn(),
      from: vi.fn(() => {
        const query = {
          insert: vi.fn(() => query),
          select: vi.fn(() => query),
          single: vi.fn(async () => ({ data: null, error: { code: "23505", message: "duplicate key" } })),
        };
        return query;
      }),
    };

    await expect(addCollaborationNotificationWithEmail(supabase as never, {
      bookId: "book-1",
      recipientUserId: "reader-1",
      eventType: "creativewriter_assignment_due_soon",
      title: "Contributor assignment due soon",
      body: "Assignment due soon: Review the opening",
      dedupeKey: "assignment-1:2026-08-06T12:00:00.000Z",
    })).resolves.toBe(false);

    expect(sendWorkflowNotificationMock).not.toHaveBeenCalled();
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("keeps queue finalization failures from failing the workflow mutation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendWorkflowNotificationMock.mockResolvedValueOnce({ sent: true });
    adminRpcMock.mockRejectedValueOnce(new Error("Service role unavailable"));
    const supabase = notificationSupabase();

    await expect(addCollaborationNotificationWithEmail(supabase as never, {
      bookId: "book-1",
      recipientUserId: "reader-1",
      actorUserId: "editor-1",
      eventType: "creativewriter_assignment_created",
      title: "Contributor assignment created",
      body: "You were assigned: Review the opening",
    })).resolves.toBe(true);
  });
});

function notificationSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === "collaboration_notifications") {
        const query = {
          insert: vi.fn(() => query),
          select: vi.fn(() => query),
          single: vi.fn(async () => ({ data: { id: "notification-1" }, error: null })),
        };
        return query;
      }
      const row = table === "profiles"
        ? { email: "reader@example.com", display_name: "Reader" }
        : { title: "The Forge" };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
      };
      return query;
    }),
  };
}