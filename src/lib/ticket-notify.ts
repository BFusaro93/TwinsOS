import { Resend } from "resend";
import { resolveBroadcastRecipients } from "@/lib/notify-shared";

// Notifies staff about CRM ticket events (created / assigned / commented).
// Mirrors src/lib/estimate-client-notify.ts's shape: per-recipient pref
// gating, in-app `notifications` row + direct Resend send (no dependency on
// an authenticated session, since this also runs from the public/portal
// ticket-submission path).
//
// crm_tickets now has a real assigned_to_id (profiles.id), set alongside the
// display-name assigned_to whenever the UI's assignee dropdown is used — see
// migration 20260811000002_crm_tickets_assigned_to_id.sql. resolveAssigneeId()
// prefers that; the name-fuzzy-match against crm_employees is a fallback
// only for rows written before that column existed (or third-party/portal
// paths that never had an id to begin with). If neither resolves, assignee
// notifications are silently skipped rather than failing the caller.
export async function resolveAssigneeId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  assignedToId: string | null,
  assignedToName: string | null
): Promise<string | null> {
  if (assignedToId) return assignedToId;
  if (!assignedToName?.trim()) return null;

  const { data: employees } = await supabase
    .from("crm_employees")
    .select("user_id, first_name, last_name")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .not("user_id", "is", null);

  const match = (employees ?? []).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => `${e.first_name} ${e.last_name}`.trim().toLowerCase() === assignedToName.trim().toLowerCase()
  );
  return match?.user_id ?? null;
}

interface NotifyBase {
  orgId: string;
  ticketId: string;
  ticketNumber: number;
  subject: string | null;
}

function ticketLabel(subject: string | null, ticketNumber: number): string {
  return subject ? `#${ticketNumber} — ${subject}` : `#${ticketNumber}`;
}

async function sendToRecipients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recipients: any[],
  opts: {
    orgId: string; ticketId: string; notifType: string;
    inAppPrefKey: string; emailPrefKey: string;
    title: string; message: string; emailHtml: (name: string | null) => string;
  }
) {
  if (!recipients.length) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inAppEligible = recipients.filter((p: any) => (p.notification_prefs ?? {})[opts.inAppPrefKey] !== false);
  if (inAppEligible.length) {
    await supabase.from("notifications").insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inAppEligible.map((p: any) => ({
        org_id: opts.orgId,
        user_id: p.id,
        type: opts.notifType,
        title: opts.title,
        message: opts.message,
        entity_id: opts.ticketId,
        entity_type: "ticket",
      }))
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const emailEligible = recipients.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => p.email && (p.notification_prefs ?? {})[opts.emailPrefKey] !== false
  );
  if (!emailEligible.length) return;

  const resend = new Resend(resendKey);
  for (const p of emailEligible) {
    await resend.emails.send({
      from: "Equipt <noreply@twinslawnservice.com>",
      to: p.email,
      subject: opts.title,
      html: opts.emailHtml(p.name ?? null),
    }).catch(() => {
      // Non-fatal — one recipient's email failing shouldn't block the others
    });
  }
}

function ticketLink(ticketId: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app";
  return `${siteUrl}/crm/tickets?open=${ticketId}`;
}

function emailShell(heading: string, name: string | null, bodyHtml: string, ticketId: string): string {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">${heading}</h2>
    <p style="margin:0 0 4px;color:#475569">Hi ${name ?? "there"},</p>
    ${bodyHtml}
    <a href="${ticketLink(ticketId)}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin-top:16px">View Ticket</a>
  </div>`;
}

/** New ticket — notifies the (resolved) assignee, if any, plus the
 *  configured broadcast audience (default: all admins/managers). */
export async function notifyStaffOfNewTicket(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: NotifyBase & { assignedToId?: string | null; assignedToName: string | null; createdByUserId: string | null }
) {
  const { orgId, ticketId, ticketNumber, subject, assignedToId, assignedToName, createdByUserId } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recipients: any[] = await resolveBroadcastRecipients(supabase, orgId, "newTicketRecipientIds");
  const assigneeId = await resolveAssigneeId(supabase, orgId, assignedToId ?? null, assignedToName);
  if (assigneeId && !recipients.some((p) => p.id === assigneeId)) {
    const { data: assignee } = await supabase
      .from("profiles")
      .select("id, email, name, notification_prefs")
      .eq("id", assigneeId)
      .single();
    if (assignee) recipients = [...recipients, assignee];
  }
  // Don't notify the person who created it themselves.
  recipients = recipients.filter((p) => p.id !== createdByUserId);
  if (!recipients.length) return;

  const label = ticketLabel(subject, ticketNumber);
  await sendToRecipients(supabase, recipients, {
    orgId, ticketId,
    notifType: "ticket_created",
    inAppPrefKey: "inAppNewTicket", emailPrefKey: "emailNewTicket",
    title: `New Ticket — ${label}`,
    message: `A new ticket was created: ${label}.`,
    emailHtml: (name) => emailShell(
      "New Ticket",
      name,
      `<p style="margin:0 0 24px;color:#475569">A new ticket was created: <strong>${label}</strong>.</p>`,
      ticketId
    ),
  });
}

/** Ticket assigned — notifies only the newly-resolved assignee (unless they
 *  assigned the ticket to themselves — never notify the actor for their own
 *  action, same rule enforced on every other notification trigger point). */
export async function notifyTicketAssigned(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: NotifyBase & { assignedToId?: string | null; assignedToName: string | null; assignedByUserId?: string | null }
) {
  const { orgId, ticketId, ticketNumber, subject, assignedToId, assignedToName, assignedByUserId } = params;
  const assigneeId = await resolveAssigneeId(supabase, orgId, assignedToId ?? null, assignedToName);
  if (!assigneeId || assigneeId === assignedByUserId) return;

  const { data: assignee } = await supabase
    .from("profiles")
    .select("id, email, name, notification_prefs")
    .eq("id", assigneeId)
    .single();
  if (!assignee) return;

  const label = ticketLabel(subject, ticketNumber);
  await sendToRecipients(supabase, [assignee], {
    orgId, ticketId,
    notifType: "ticket_assigned",
    inAppPrefKey: "inAppTicketAssigned", emailPrefKey: "emailTicketAssigned",
    title: `Ticket Assigned — ${label}`,
    message: `You were assigned ticket ${label}.`,
    emailHtml: (name) => emailShell(
      "Ticket Assigned to You",
      name,
      `<p style="margin:0 0 24px;color:#475569">You were assigned ticket <strong>${label}</strong>.</p>`,
      ticketId
    ),
  });
}

/** Ticket comment — notifies the resolved assignee (if not the commenter). */
export async function notifyTicketComment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: NotifyBase & { assignedToId?: string | null; assignedToName: string | null; commenterName: string; commenterId: string | null; commentBody: string }
) {
  const { orgId, ticketId, ticketNumber, subject, assignedToId, assignedToName, commenterName, commenterId, commentBody } = params;
  const assigneeId = await resolveAssigneeId(supabase, orgId, assignedToId ?? null, assignedToName);
  if (!assigneeId || assigneeId === commenterId) return;

  const { data: assignee } = await supabase
    .from("profiles")
    .select("id, email, name, notification_prefs")
    .eq("id", assigneeId)
    .single();
  if (!assignee) return;

  const label = ticketLabel(subject, ticketNumber);
  const snippet = commentBody.length > 120 ? `${commentBody.slice(0, 120)}…` : commentBody;
  await sendToRecipients(supabase, [assignee], {
    orgId, ticketId,
    notifType: "ticket_comment",
    inAppPrefKey: "inAppTicketComment", emailPrefKey: "emailTicketComment",
    title: `New Comment — ${label}`,
    message: `${commenterName} commented on ${label}: "${snippet}"`,
    emailHtml: (name) => emailShell(
      "New Comment on Your Ticket",
      name,
      `<p style="margin:0 0 8px;color:#475569">${commenterName} commented on <strong>${label}</strong>:</p>
       <blockquote style="margin:0 0 24px;padding:12px 16px;background:#f8fafc;border-left:4px solid #e2e8f0;border-radius:4px;color:#374151;font-style:italic">${snippet}</blockquote>`,
      ticketId
    ),
  });
}
