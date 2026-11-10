import { Resend } from "resend";
import { resolveBroadcastRecipients } from "@/lib/notify-shared";
import { EMAIL_FROM, orgEmailFrom, sendEmailRetryingRateLimit } from "@/lib/email/send";
import { escapeHtml } from "@/lib/utils/escape-html";
import { proposalUrlFor } from "@/lib/estimates/share-token";
import { logger } from "@/lib/logger";

const log = logger.child("estimate deposit notify");

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

  // The client is told too: the proposal page promised them an email "if
  // anything goes wrong" with their bank transfer. Independent of whether any
  // staff member is set up to hear about it.
  await notifyClientOfFailedDeposit(supabase, { orgId, estimateId, estimateNumber, amountCents, method, reason });

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
        .neq("status", "inactive")
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
    await sendEmailRetryingRateLimit(resend, {
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

/**
 * Emails the CLIENT that their proposal deposit was rejected, with the link to
 * pay it again (the accepted proposal link re-opens for exactly that — it never
 * expires once accepted). Service mail, so a marketing opt-out doesn't stop it;
 * a hard-bounced address does. Logged on the estimate's email history. Never
 * throws: the webhook calling this must still acknowledge the event.
 */
export async function notifyClientOfFailedDeposit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    orgId: string;
    estimateId: string;
    estimateNumber: number | null;
    amountCents: number;
    method: "card" | "us_bank_account";
    reason: string;
  }
): Promise<void> {
  const { orgId, estimateId, estimateNumber, amountCents, method, reason } = params;
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return;
    const { data: est } = await supabase
      .from("estimates")
      .select("client_id, clients(primary_email, display_name, email_bounced_at)")
      .eq("id", estimateId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    const client = (est?.clients ?? null) as { primary_email?: string | null; display_name?: string | null; email_bounced_at?: string | null } | null;
    const to = client?.primary_email?.trim();
    if (!to || client?.email_bounced_at) return;

    // The link the client accepted through (accepted first, then newest).
    const { data: tokens } = await supabase
      .from("estimate_share_tokens")
      .select("token, accepted_at")
      .eq("estimate_id", estimateId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("accepted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);
    const token = (tokens as { token: string }[] | null)?.[0]?.token ?? null;
    const link = token ? proposalUrlFor(token) : null;

    const { data: org } = await supabase
      .from("organizations")
      .select("name, brand_color, address")
      .eq("id", orgId)
      .single();
    const orgName = (org?.name as string | undefined) ?? "Your service provider";
    const brand = /^#[0-9a-fA-F]{3,8}$/.test((org?.brand_color as string | undefined) ?? "") ? (org!.brand_color as string) : "#60ab45";
    const phone = ((org?.address as Record<string, string> | null) ?? {}).phone ?? "";

    const amount = (amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    const how = method === "us_bank_account" ? "bank transfer" : "card payment";
    const label = estimateNumber ? `Estimate #${String(estimateNumber).padStart(5, "0")}` : "your proposal";
    const subject = `Your deposit for ${label} didn't go through — ${orgName}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1e293b">
      <h2 style="margin:0 0 8px;font-size:20px">${escapeHtml(orgName)}</h2>
      <p style="margin:0 0 12px;color:#475569">Hi ${escapeHtml(client?.display_name ?? "there")},</p>
      <p style="margin:0 0 12px;color:#475569">Your <strong>${escapeHtml(amount)}</strong> deposit ${escapeHtml(how)} for <strong>${escapeHtml(label)}</strong> was returned and has not been paid.</p>
      <p style="margin:0 0 16px;padding:12px;background:#fef2f2;border-radius:6px;color:#991b1b;font-size:14px">${escapeHtml(reason)}</p>
      <p style="margin:0 0 20px;color:#475569;font-size:14px">Your proposal is still accepted — nothing needs signing again. You can pay the deposit from your proposal page${phone ? `, or call us at <strong>${escapeHtml(phone)}</strong>` : ""}.</p>
      ${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 24px;background:${brand};color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Pay deposit</a>` : ""}
    </div>`;

    const resend = new Resend(resendKey);
    const { data: sent, error } = await sendEmailRetryingRateLimit(resend, {
      from: orgEmailFrom(orgName),
      to,
      subject,
      html,
    });
    if (error) {
      log.error("failed to email the client about a failed deposit", { estimateId, error: error.message });
      return;
    }
    await supabase.from("estimate_emails").insert({
      org_id: orgId,
      estimate_id: estimateId,
      to_email: to,
      to_name: client?.display_name ?? null,
      subject,
      body_html: html,
      resend_id: sent?.id ?? null,
      email_type: "deposit_failed",
    });
  } catch (err) {
    log.error("failed to email the client about a failed deposit", { estimateId, error: err instanceof Error ? err.message : err });
  }
}

/**
 * Tells staff a client accepted a proposal WITHOUT paying (or promising) its
 * required deposit. Deposits are optional — the client may Skip — but the
 * office needs to know so someone follows up. Re-reads the estimate and does
 * nothing when a deposit is collected, clearing or promised, or (unless the
 * client explicitly pressed Skip) when an online payment was started: the
 * card flow accepts with no deposit fields while the webhook records the
 * charge. Deduped per estimate. Never throws.
 */
export async function notifyStaffOfSkippedDeposit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: { orgId: string; estimateId: string; via: "proposal_link" | "client_portal"; explicitSkip?: boolean }
): Promise<void> {
  const { orgId, estimateId, via, explicitSkip } = params;
  try {
    const { data: est } = await supabase
      .from("estimates")
      .select("estimate_number, total_cents, deposit_required_cents, deposit_collected_cents, deposit_pending_cents, deposit_pending_intent_id, deposit_promised_cents, sales_rep_id, clients(display_name)")
      .eq("id", estimateId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!est) return;
    const required = (est.deposit_required_cents as number | null) ?? 0;
    if (required <= 0) return;
    if (((est.deposit_collected_cents as number | null) ?? 0) > 0) return;
    if (((est.deposit_pending_cents as number | null) ?? 0) > 0) return;
    if (((est.deposit_promised_cents as number | null) ?? 0) > 0) return;
    if (!explicitSkip && est.deposit_pending_intent_id) return;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("org_id", orgId)
      .eq("type", "estimate_deposit_skipped")
      .eq("entity_id", estimateId)
      .limit(1)
      .maybeSingle();
    if (existing) return;

    let recipients = await resolveBroadcastRecipients(supabase, orgId, "estimateDecisionRecipientIds");
    if (est.sales_rep_id) {
      const { data: employee } = await supabase
        .from("crm_employees")
        .select("user_id")
        .eq("id", est.sales_rep_id)
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
          .neq("status", "inactive")
          .maybeSingle();
        if (rep) recipients = [...recipients, rep];
      }
    }
    if (!recipients.length) return;

    const total = (est.total_cents as number | null) ?? 0;
    const due = total > 0 ? Math.min(required, total) : required;
    const amount = (due / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    const label = est.estimate_number ? `#${est.estimate_number}` : "this estimate";
    const clientName = (est.clients as { display_name?: string } | null)?.display_name ?? "The client";
    const where = via === "client_portal" ? "in the client portal" : "from the proposal link";
    const title = `Accepted without deposit — ${label}`;
    const message = `${clientName} accepted Estimate ${label} ${where} without paying the ${amount} deposit. It's still shown to them as due — follow up to collect it.`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inApp = recipients.filter((p: any) => (p.notification_prefs ?? {}).inAppEstimateDepositSkipped !== false);
    if (inApp.length) {
      await supabase.from("notifications").insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inApp.map((p: any) => ({
          org_id: orgId,
          user_id: p.id,
          type: "estimate_deposit_skipped",
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
      (p: any) => p.email && (p.notification_prefs ?? {}).emailEstimateDepositSkipped !== false
    );
    if (!emailEligible.length) return;
    const resend = new Resend(resendKey);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
    const link = `${siteUrl}/crm/estimates/${estimateId}`;
    for (const p of emailEligible) {
      await sendEmailRetryingRateLimit(resend, {
        from: EMAIL_FROM,
        to: p.email,
        subject: title,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Accepted without deposit</h2>
          <p style="margin:0 0 4px;color:#475569">Hi ${escapeHtml(p.name ?? "there")},</p>
          <p style="margin:0 0 24px;color:#475569">${escapeHtml(message)}</p>
          <a href="${link}" style="display:inline-block;padding:12px 24px;background:#d97706;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Estimate</a>
        </div>`,
      }).catch(() => {
        // Non-fatal — one recipient's email failing shouldn't block the others
      });
    }
  } catch (err) {
    log.error("failed to notify staff of a skipped deposit", { estimateId, error: err instanceof Error ? err.message : err });
  }
}
