import { Resend } from "resend";
import { EMAIL_FROM } from "@/lib/email/send";
import { sendPushToUser } from "@/lib/notifications/send-push";

// Notifies every @mentioned user on a comment — works for any CommentRecordType
// (ticket, work_order, po, requisition, receiving, project, damage_case,
// crm_estimate), unlike the ticket-specific notifyTicketComment in
// ticket-notify.ts, since a mention can happen inside a comment on any of
// them. Same shape as that file: in-app `notifications` row + direct Resend
// send, plus a push to any crew-app recipients. Self-suppressed — a user
// mentioning themselves never generates a notification.
export async function notifyMentions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    orgId: string;
    recordType: string;
    recordId: string;
    mentionedUserIds: string[];
    commenterId: string | null;
    commenterName: string;
    commentBody: string;
  }
) {
  const { orgId, recordType, recordId, mentionedUserIds, commenterId, commenterName, commentBody } = params;
  const recipientIds = [...new Set(mentionedUserIds)].filter((id) => id !== commenterId);
  if (!recipientIds.length) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recipients } = await supabase
    .from("profiles")
    .select("id, email, name, notification_prefs")
    .in("id", recipientIds);
  if (!recipients?.length) return;

  const snippet = commentBody.length > 120 ? `${commentBody.slice(0, 120)}…` : commentBody;
  const title = `${commenterName} mentioned you`;
  const message = `${commenterName} mentioned you in a comment: "${snippet}"`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inAppEligible = recipients.filter((p: any) => (p.notification_prefs ?? {}).inAppMention !== false);
  if (inAppEligible.length) {
    await supabase.from("notifications").insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inAppEligible.map((p: any) => ({
        org_id: orgId,
        user_id: p.id,
        type: "comment_mention",
        title,
        message,
        entity_id: recordId,
        entity_type: recordType,
      }))
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emailEligible = recipients.filter((p: any) => p.email && (p.notification_prefs ?? {}).emailMention !== false);
    if (emailEligible.length) {
      const resend = new Resend(resendKey);
      for (const p of emailEligible) {
        await resend.emails.send({
          from: EMAIL_FROM,
          to: p.email,
          subject: title,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">${title}</h2>
            <p style="margin:0 0 4px;color:#475569">Hi ${p.name ?? "there"},</p>
            <p style="margin:0 0 8px;color:#475569">${commenterName} mentioned you in a comment:</p>
            <blockquote style="margin:0 0 24px;padding:12px 16px;background:#f8fafc;border-left:4px solid #e2e8f0;border-radius:4px;color:#374151;font-style:italic">${snippet}</blockquote>
          </div>`,
        }).catch(() => {
          // Non-fatal — one recipient's email failing shouldn't block the others
        });
      }
    }
  }

  await Promise.all(
    recipientIds.map((id) =>
      sendPushToUser({
        userId: id,
        title,
        body: message,
        data: { entityType: recordType, entityId: recordId },
      })
    )
  );
}
