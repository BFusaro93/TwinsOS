import { Resend } from "resend";
import { resolveBroadcastRecipients } from "@/lib/notify-shared";
import { EMAIL_FROM } from "@/lib/email/send";
import { escapeHtml } from "@/lib/utils/escape-html";

/**
 * Tells staff a proposal deposit was rejected.
 *
 * This is the only signal that anything went wrong. An ACH debit is authorized
 * at acceptance and returned by the bank days later, by which point the
 * proposal reads as accepted, the job is very likely scheduled, and the
 * deposit that was supposed to come before any work simply isn't there. Before
 * this, the webhook cleared the pending flag and said nothing.
 *
 * Deliberately reuses the estimateDecisionRecipientIds audience rather than
 * adding another configurable list: the people who wanted to hear that a
 * proposal was accepted are exactly the people who need to hear that its
 * deposit then bounced. Runs from the Stripe webhook with the service-role
 * client and no staff session, so email goes out directly here — same shape as
 * notifyStaffOfEstimateDecision.
 */
export async function notifyStaffOfFailedDeposit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    orgId: string;
    estimateId: string;
    estimateNumber: number | null;
    clientName: string | null;
    salesRepId: string | null;
    amountCents: number;
    method: "card" | "us_bank_account";
    reason: string;
  }
) {
  const { orgId, estimateId, estimateNumber, clientName, salesRepId, amountCents, method, reason } = params;

  let recipients = await resolveBroadcastRecipients(supabase, orgId, "estimateDecisionRecipientIds");
  if (salesRepId) {
    // estimates.sales_rep_id is a crm_employees.id, not a profiles.id —
    // resolve through crm_employees.user_id first (same hop as
    // notifyStaffOfEstimateDecision and resolveAssigneeId).
    const { data: employee } = await supabase
      .from("crm_employees")
      .select("user_id")
      .eq("id", salesRepId)
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
        .maybeSingle();
      if (rep) recipients = [...recipients, rep];
    }
  }
  if (!recipients.length) return;

  const amount = (amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const label = estimateNumber ? `#${estimateNumber}` : "this estimate";
  const how = method === "us_bank_account" ? "bank transfer" : "card payment";
  const title = `Deposit failed — ${label}`;
  const message = `${clientName ?? "The client"}'s ${amount} deposit ${how} for Estimate ${label} was rejected: ${reason}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inAppEligible = recipients.filter((p: any) => (p.notification_prefs ?? {}).inAppEstimateDepositFailed !== false);
  if (inAppEligible.length) {
    await supabase.from("notifications").insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inAppEligible.map((p: any) => ({
        org_id: orgId,
        user_id: p.id,
        type: "estimate_deposit_failed",
        title,
        message,
        entity_id: estimateId,
        entity_type: "estimate",
      }))
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const emailEligible = recipients.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => p.email && (p.notification_prefs ?? {}).emailEstimateDepositFailed !== false
  );
  if (!emailEligible.length) return;

  const resend = new Resend(resendKey);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
  const link = `${siteUrl}/crm/estimates/${estimateId}`;

  for (const p of emailEligible) {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: p.email,
      subject: title,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Deposit failed</h2>
        <p style="margin:0 0 4px;color:#475569">Hi ${escapeHtml(p.name ?? "there")},</p>
        <p style="margin:0 0 16px;color:#475569"><strong>${escapeHtml(clientName ?? "The client")}</strong>'s <strong>${escapeHtml(amount)}</strong> deposit ${escapeHtml(how)} for Estimate <strong>${escapeHtml(label)}</strong> was rejected.</p>
        <p style="margin:0 0 16px;padding:12px;background:#fef2f2;border-radius:6px;color:#991b1b;font-size:14px">${escapeHtml(reason)}</p>
        <p style="margin:0 0 24px;color:#475569;font-size:14px">The proposal stays accepted — only the deposit failed. The client can pay it again from their original proposal link, which has been re-opened for exactly that.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Estimate</a>
      </div>`,
    }).catch(() => {
      // Non-fatal — one recipient's email failing shouldn't block the others
    });
  }
}
