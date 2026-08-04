import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

describe("workflow notification email", () => {
  const originalApiKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "test-key";
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
  });

  it("passes a stable notification idempotency key to Resend", async () => {
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null, headers: null });
    const { sendWorkflowNotification } = await import("@/lib/email");

    await expect(sendWorkflowNotification({
      toEmail: "reader@example.com",
      bookTitle: "The Forge",
      title: "Contributor assignment due soon",
      body: "Review the opening",
      actorLabel: "BookForge",
      idempotencyKey: "collaboration-notification-notification-1",
    })).resolves.toEqual({ sent: true });

    expect(sendMock).toHaveBeenCalledWith(expect.any(Object), {
      idempotencyKey: "collaboration-notification-notification-1",
    });
  });

  it("rejects resolved provider errors so the delivery remains retryable", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Rate limited", name: "rate_limit_exceeded", statusCode: 429 },
      headers: null,
    });
    const { sendWorkflowNotification } = await import("@/lib/email");

    await expect(sendWorkflowNotification({
      toEmail: "reader@example.com",
      bookTitle: "The Forge",
      title: "Contributor assignment due soon",
      body: "Review the opening",
      actorLabel: "BookForge",
      idempotencyKey: "collaboration-notification-notification-1",
    })).rejects.toThrow("Rate limited");
  });
});
