// Shared by the public proposal link and the authenticated client-portal route —
// both let a customer leave a "please change this" note on an estimate, which
// creates a record staff can see and notifies admins/managers — plus the
// estimate's salesperson — in-app.

import { Resend } from "resend";
import { EMAIL_FROM, sendEmailRetryingRateLimit } from "@/lib/email/send";
import { escapeHtml } from "@/lib/utils/escape-html";

export const MAX_CHANGE_REQUEST_MESSAGE_CHARS = 4000;

export async function submitEstimateChangeRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    orgId: string;
    estimateId: string;
    clientId: string | null;
    estimateNumber: number;
    message: string;
    requesterName: string;
    requesterEmail?: string | null;
  }
) {
  const { orgId, estimateId, clientId, estimateNumber, message, requesterName, requesterEmail } = params;

  // The change-request row is the record staff act on: if it isn't saved the
  // caller must fail (previously the error was dropped and the client was told
  // their request went through). The activity/notification writes below are
  // best-effort side effects.
  const { error: insertErr } = await supabase.from("estimate_change_requests").insert({
    org_id: orgId,
    estimate_id: estimateId,
    client_id: clientId,
    message,
    requester_name: requesterName,
    requester_email: requesterEmail ?? null,
  });
  if (insertErr) throw new Error(`Failed to save change request: ${insertErr.message}`);

  if (clientId) {
    await supabase.from("client_activity").insert({
      org_id: orgId,
      client_id: clientId,
      activity_type: "estimate",
      subject: `Change requested on Estimate #${estimateNumber}`,
      body: `${requesterName}: ${message}`,
      ref_id: estimateId,
      ref_table: "estimates",
      occurred_at: new Date().toISOString(),
    });
  }

  // Notify admins/managers in-app (same audience pattern used for new maintenance requests)
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, email, name, notification_prefs")
    .eq("org_id", orgId)
    .neq("status", "inactive")
    .in("role", ["admin", "manager"]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recipients: any[] = staff ?? [];

  // The estimate's salesperson hears about it too, even when they aren't an
  // admin or manager. estimates.sales_rep_id is a crm_employees.id, so resolve
  // through crm_employees.user_id before profiles (same hop as
  // notifyStaffOfEstimateDecision). Best-effort: a failed lookup just means the
  // admin/manager audience above is all that's notified.
  const { data: estimateRow } = await supabase
    .from("estimates")
    .select("sales_rep_id")
    .eq("id", estimateId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (estimateRow?.sales_rep_id) {
    const { data: employee } = await supabase
      .from("crm_employees")
      .select("user_id")
      .eq("id", estimateRow.sales_rep_id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    const repUserId = employee?.user_id ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (repUserId && !recipients.some((p: any) => p.id === repUserId)) {
      const { data: rep } = await supabase
        .from("profiles")
        .select("id, email, name, notification_prefs")
        .eq("id", repUserId)
        .eq("org_id", orgId)
        // A deactivated login must not keep getting change-request notifications.
        .neq("status", "inactive")
        .maybeSingle();
      if (rep) recipients = [...recipients, rep];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eligible = recipients.filter((p: any) => (p.notification_prefs ?? {}).inAppEstimateChangeRequest !== false);

  if (eligible.length) {
    const title = `Change requested — Estimate #${estimateNumber}`;
    await supabase.from("notifications").insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eligible.map((p: { id: string }) => ({
        org_id: orgId,
        user_id: p.id,
        type: "estimate_change_request",
        title,
        message: `${requesterName}: ${message}`,
        entity_id: estimateId,
        entity_type: "estimate",
      }))
    );
  }

  // Email the same audience, each person honoring their own email preference.
  // Best-effort: one failed send must not fail the client's request or block
  // the other recipients. The message and requester name are client-typed
  // free text — escaped before going into HTML.
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailEligible = recipients.filter((p: any) => p.email && (p.notification_prefs ?? {}).emailEstimateChangeRequest !== false);
  if (!emailEligible.length) return;

  const resend = new Resend(resendKey);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
  const link = `${siteUrl}/crm/estimates/${estimateId}`;
  const subject = `Change requested — Estimate #${estimateNumber}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of emailEligible as any[]) {
    await sendEmailRetryingRateLimit(resend, {
      from: EMAIL_FROM,
      to: p.email,
      subject,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Change requested</h2>
        <p style="margin:0 0 4px;color:#475569">Hi ${escapeHtml(p.name ?? "there")},</p>
        <p style="margin:0 0 16px;color:#475569"><strong>${escapeHtml(requesterName)}</strong> asked for changes on Estimate <strong>#${estimateNumber}</strong>:</p>
        <blockquote style="margin:0 0 24px;padding:12px 16px;background:#f1f5f9;border-left:3px solid #94a3b8;color:#334155;white-space:pre-wrap">${escapeHtml(message)}</blockquote>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Estimate</a>
      </div>`,
    }).catch(() => {
      // Non-fatal — see above.
    });
  }
}
