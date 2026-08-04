import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyAssignmentCreated, notifyAssignmentDueSoon, notifyAssignmentUpdated, type AssignmentNotificationSnapshot } from "@/lib/creativewriter/assignment-notifications";

const { addNotificationMock } = vi.hoisted(() => ({ addNotificationMock: vi.fn() }));

vi.mock("@/lib/collaboration/workflow", () => ({
  addCollaborationNotificationWithEmail: addNotificationMock,
}));

describe("CreativeWriter assignment notifications", () => {
  beforeEach(() => addNotificationMock.mockReset());

  it("notifies the assignee when an assignment is created and newly due soon", async () => {
    const assignment = snapshot({ due_at: "2026-08-06T12:00:00.000Z" });

    await notifyAssignmentCreated({} as never, assignment, "editor-1", new Date("2026-08-04T12:00:00.000Z"));

    expect(addNotificationMock).toHaveBeenCalledTimes(2);
    expect(addNotificationMock.mock.calls.map((call) => call[1].eventType)).toEqual([
      "creativewriter_assignment_created",
      "creativewriter_assignment_due_soon",
    ]);
    expect(addNotificationMock.mock.calls[0]?.[1]).toMatchObject({
      recipientUserId: "assignee-1",
      actorUserId: "editor-1",
      metadata: { assignmentId: "assignment-1", dueAt: "2026-08-06T12:00:00.000Z" },
    });
    expect(addNotificationMock.mock.calls[1]?.[1].dedupeKey).toBe(
      "creativewriter-assignment-due:assignment-1:2026-08-06T12:00:00.000Z",
    );
  });

  it("attempts every event without failing the assignment mutation", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    addNotificationMock.mockRejectedValueOnce(new Error("Notification write failed"));

    await expect(notifyAssignmentCreated(
      {} as never,
      snapshot({ due_at: "2026-08-06T12:00:00.000Z" }),
      "editor-1",
      new Date("2026-08-04T12:00:00.000Z"),
    )).resolves.toBeUndefined();

    expect(addNotificationMock).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith("Unable to deliver assignment notification", expect.any(Error));
  });

  it("notifies both people when an assignment is reassigned", async () => {
    await notifyAssignmentUpdated(
      {} as never,
      snapshot(),
      snapshot({ assignee_id: "assignee-2" }),
      "editor-1",
    );

    expect(addNotificationMock.mock.calls.map((call) => [call[1].recipientUserId, call[1].eventType])).toEqual([
      ["assignee-1", "creativewriter_assignment_removed"],
      ["assignee-2", "creativewriter_assignment_reassigned"],
    ]);
  });

  it("emits one changed or cancelled event and ignores ordinary status progress", async () => {
    await notifyAssignmentUpdated({} as never, snapshot(), snapshot({ note: "New guidance" }), "editor-1");
    await notifyAssignmentUpdated({} as never, snapshot(), snapshot({ status: "cancelled" }), "editor-1");
    await notifyAssignmentUpdated({} as never, snapshot(), snapshot({ status: "in_progress" }), "assignee-1");

    expect(addNotificationMock.mock.calls.map((call) => call[1].eventType)).toEqual([
      "creativewriter_assignment_changed",
      "creativewriter_assignment_cancelled",
    ]);
  });

  it("normalizes due-soon dedupe keys to UTC ISO timestamps", async () => {
    const assignment = snapshot({ due_at: "2026-08-05T08:00:00-04:00" });
    const supabase = {} as never;

    await notifyAssignmentDueSoon(supabase, assignment, new Date("2026-08-04T12:00:00.000Z"));

    expect(addNotificationMock).toHaveBeenCalledWith(supabase, expect.objectContaining({
      dedupeKey: "creativewriter-assignment-due:assignment-1:2026-08-05T12:00:00.000Z",
    }));
    expect(addNotificationMock).toHaveBeenCalledTimes(1);
  });
});

function snapshot(overrides: Partial<AssignmentNotificationSnapshot> = {}): AssignmentNotificationSnapshot {
  return {
    id: "assignment-1",
    book_id: "book-1",
    chapter_id: "chapter-1",
    paragraph_id: null,
    assignee_id: "assignee-1",
    status: "assigned",
    title: "Review the opening",
    note: null,
    due_at: null,
    ...overrides,
  };
}