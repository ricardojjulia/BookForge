import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.RESEND_FROM ?? "BookForge <onboarding@resend.dev>";

export async function sendCollaboratorInvite({
  toEmail,
  bookTitle,
  inviteUrl,
  role,
  invitedByEmail,
}: {
  toEmail: string;
  bookTitle: string;
  inviteUrl: string;
  role: string;
  invitedByEmail: string;
}): Promise<{ sent: boolean }> {
  if (!resend) return { sent: false };

  const roleLabel = role === "viewer" ? "view" : role === "editor" ? "edit" : "fully manage";

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `You've been invited to collaborate on "${bookTitle}"`,
    html: `
      <p>Hi,</p>
      <p><strong>${invitedByEmail}</strong> has invited you to <strong>${roleLabel}</strong>
      the manuscript <em>${bookTitle}</em> on BookForge.</p>
      <p>
        <a href="${inviteUrl}" style="display:inline-block;padding:10px 20px;background:#228be6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
          Accept invitation
        </a>
      </p>
      <p style="color:#868e96;font-size:13px;">
        This link expires in 7 days. If you weren't expecting this, you can ignore it.
      </p>
    `,
    text: `${invitedByEmail} invited you to ${roleLabel} "${bookTitle}" on BookForge.\n\nAccept here: ${inviteUrl}\n\nThis link expires in 7 days.`,
  });

  return { sent: true };
}

export async function sendWorkflowNotification({
  toEmail,
  bookTitle,
  title,
  body,
  actorLabel,
  idempotencyKey,
}: {
  toEmail: string;
  bookTitle: string;
  title: string;
  body: string;
  actorLabel: string;
  idempotencyKey?: string;
}): Promise<{ sent: boolean }> {
  if (!resend) return { sent: false };

  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${title} · ${bookTitle}`,
    html: `
      <p><strong>${actorLabel}</strong> updated a workflow item on <em>${bookTitle}</em>.</p>
      <p><strong>${title}</strong></p>
      <p>${body}</p>
    `,
    text: `${actorLabel} updated a workflow item on ${bookTitle}.\n\n${title}\n${body}`,
  }, { idempotencyKey });
  if (error) throw new Error(error.message);

  return { sent: true };
}
