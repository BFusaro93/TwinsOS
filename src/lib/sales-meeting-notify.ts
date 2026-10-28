import { Resend } from "resend";
import { EMAIL_FROM, escapeHtml, sendEmailRetryingRateLimit } from "@/lib/email/send";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { recipientFromEmployee } from "@/lib/notifications/reminder-recipients";

// Tells a sales rep a meeting was put on their calendar (created for them, or
// reassigned to them). The 60-minute reminder cron is separate and still fires.
// Uses the same per-user preference keys as that reminder
// (inAppMeetingReminder / emailMeetingReminder) so there is one meeting toggle.

export async function notifyMeetingAssigned(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  params: {
    orgId: string;
    meetingId: string;
    title: string;
    scheduledAt: string;
    location: string | null;
    clientName: string;
    repEmployeeId: string;
    assignerUserId: string;
  }
) {
  const { orgId, meetingId, title, scheduledAt, location, clientName, repEmployeeId, assignerUserId } = params;
  const rep = await recipientFromEmployee(db, orgId, repEmployeeId);
  if (!rep) return;
  // Never notify the actor about their own action (booking a meeting for yourself).
  if (rep.userId && rep.userId === assignerUserId) return;

  const tz = await getOrgTimeZone(db, orgId);
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz,
  }).format(new Date(scheduledAt));
  const heading = `Meeting assigned — ${clientName}`;
  const message = `${title} with ${clientName} is on your calendar for ${when}${location ? ` at ${location}` : ""}.`;

  if (rep.userId && rep.prefs.inAppMeetingReminder !== false) {
    await db.from("notifications").insert({
      org_id: orgId,
      user_id: rep.userId,
      type: "sales_meeting_assigned",
      title: heading,
      message,
      entity_id: meetingId,
      entity_type: "sales_meeting",
    });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !rep.email || rep.prefs.emailMeetingReminder === false) return;
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com"}/crm/sales-meetings?open=${meetingId}`;
  await sendEmailRetryingRateLimit(new Resend(resendKey), {
    from: EMAIL_FROM,
    to: rep.email,
    subject: heading.replace(/\s+/g, " ").trim(),
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Sales Meeting Assigned</h2>
      <p style="margin:0 0 4px;color:#475569">Hi ${escapeHtml(rep.firstName || "there")},</p>
      <p style="margin:0 0 24px;color:#475569"><strong>${escapeHtml(title)}</strong> with ${escapeHtml(clientName)} is on your calendar for <strong>${escapeHtml(when)}</strong>${location ? ` at ${escapeHtml(location)}` : ""}.</p>
      <a href="${url}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Meeting</a>
    </div>`,
  }).catch(() => {
    // Non-fatal — the in-app notification already went out.
  });
}
