import { Resend } from "resend";
import { resolveBroadcastRecipients } from "@/lib/notify-shared";
import { resolveAssigneeId } from "@/lib/ticket-notify";
import { EMAIL_FROM, escapeHtml } from "@/lib/email/send";
import { sendPushToUser } from "@/lib/notifications/send-push";

// Alerts the supervisor when an injury / illness / near miss is reported, so the
// supervisor's half of the paper process (investigation within 48 hours) starts
// without anyone having to remember to forward the report.
//
// Who gets it: the supervisor the reporter named, when that name matches an
// employee with a login. If it doesn't resolve (blank, a typo, or a supervisor
// with no login) the org's admins/managers are alerted instead so a report is
// never silently dropped. The reporter is never notified of their own report.
// Per-recipient prefs `inAppInjuryReport` / `emailInjuryReport` opt out (absent
// = on). The email carries only who/what/when — the details stay behind login.

const TYPE_LABEL: Record<string, string> = {
  injury: "Injury",
  illness: "Illness",
  near_miss: "Near miss",
};

interface InjuryNotifyCase {
  id: string;
  incident_type: string;
  employee_name: string;
  supervisor_name: string | null;
  date_of_incident: string;
  location: string | null;
  severity: string | null;
}

export async function notifyInjuryReported(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: { orgId: string; reporterId: string | null; injuryCase: InjuryNotifyCase }
): Promise<{ recipients: number }> {
  const { orgId, reporterId, injuryCase: c } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recipients: any[] = [];
  const supervisorUserId = await resolveAssigneeId(supabase, orgId, null, c.supervisor_name);
  if (supervisorUserId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, name, notification_prefs")
      .eq("id", supervisorUserId)
      .eq("org_id", orgId)
      .neq("status", "inactive");
    recipients = data ?? [];
  }
  if (!recipients.length) {
    recipients = await resolveBroadcastRecipients(supabase, orgId, "injuryReportRecipients");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recipients = recipients.filter((p: any) => p.id !== reporterId);
  if (!recipients.length) return { recipients: 0 };

  const label = TYPE_LABEL[c.incident_type] ?? "Incident";
  const title = `${label} reported: ${c.employee_name}`;
  const where = c.location ? ` at ${c.location}` : "";
  const message = `${label} on ${c.date_of_incident}${where}. Please follow up — the investigation is due within 48 hours.`;
  const path = `/tools/injury-cases?open=${encodeURIComponent(c.id)}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inApp = recipients.filter((p: any) => (p.notification_prefs ?? {}).inAppInjuryReport !== false);
  if (inApp.length) {
    await supabase.from("notifications").insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inApp.map((p: any) => ({
        org_id: orgId,
        user_id: p.id,
        type: "injury_reported",
        title,
        message,
        entity_id: c.id,
        entity_type: "injury_case",
      }))
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emailable = recipients.filter((p: any) => p.email && (p.notification_prefs ?? {}).emailInjuryReport !== false);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
    const resend = new Resend(resendKey);
    for (const p of emailable) {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: p.email,
        subject: title,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">${escapeHtml(title)}</h2>
          <p style="margin:0 0 4px;color:#475569">Hi ${escapeHtml(p.name ?? "there")},</p>
          <p style="margin:0 0 24px;color:#475569">${escapeHtml(message)}</p>
          <a href="${siteUrl}${path}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Open report</a>
        </div>`,
      }).catch(() => {
        // Non-fatal — one recipient's email failing shouldn't block the others
      });
    }
  }

  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recipients.map((p: any) =>
      sendPushToUser({ userId: p.id, title, body: message, data: { entityType: "injury_case", entityId: c.id } })
    )
  );

  return { recipients: recipients.length };
}
