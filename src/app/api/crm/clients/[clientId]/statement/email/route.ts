import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { AccountStatementDocument } from "@/components/crm/invoices/pdf/AccountStatementDocument";
import type { AccountStatementPDFData } from "@/components/crm/invoices/pdf/AccountStatementDocument";
import type { OrgPDFData } from "@/components/crm/invoices/pdf/InvoiceDocument";
import { buildAccountStatementData } from "@/lib/invoices/account-statement-data";
import { orgEmailFrom, mapSendError, buildClientMergeVars, resolveMergeTags } from "@/lib/email/send";
import { logger } from "@/lib/logger";
import { getMyTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

const log = logger.child("email-statement");

const DEFAULT_SUBJECT = "Your account statement from [companyname]";
const DEFAULT_BODY = `<p>Hi [clientfirstname],</p>

<p>Please find attached your account statement from [companyname]. Your current balance is [accountbalance].</p>

<p>If you have any questions, please don't hesitate to reach out.</p>

<p>Thank you,<br>[companyname]<br>[companyphonenumber]</p>`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todayISO(supabase: any): Promise<string> {
  // The statement's "as of" date must be the company's calendar day. This runs
  // on Vercel, whose Node runtime is UTC, so toISOString() would date a
  // statement pulled at 9pm Eastern as tomorrow — and at month end, put it in
  // the wrong month from the balances it was computed against.
  return todayInZone(await getMyTimeZone(supabase));
}

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Granular per-role permission — admins always pass, otherwise gated by
  // crm_roles.permissions.acct_send_statements. An account statement discloses a client's
  // full billing history, so sending one is gated separately from viewing it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allowed } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "acct_send_statements",
  });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    to?: string[];
    subject?: string;
    bodyHtml?: string;
    statementDate?: string;
    periodFrom?: string;
    periodTo?: string;
    message?: string;
    detail?: boolean;
    minBalanceCents?: number;
  };

  if (body.to?.some((e) => !isValidEmail(e))) {
    return NextResponse.json({ error: "Invalid recipient email address" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client, error: clientErr } = await (supabase as any)
    .from("clients")
    .select("org_id, display_name, primary_email, email_bounced_at, billing_address, billing_city, billing_state, billing_zip")
    .eq("id", clientId)
    .is("deleted_at", null)
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const toEmails = (body.to && body.to.length > 0)
    ? body.to.map((e) => e.trim())
    : (client.primary_email ? [client.primary_email as string] : []);
  if (toEmails.length === 0) {
    return NextResponse.json({ error: "Client has no email address on file" }, { status: 422 });
  }

  // A hard bounce means the stored address doesn't accept mail; re-sending
  // damages sending-domain reputation, so it is blocked for transactional mail
  // too (see the Resend webhook that sets email_bounced_at). An explicit `to`
  // override is how staff send to a corrected address, so it is not blocked.
  if (!(body.to && body.to.length > 0) && client.email_bounced_at) {
    return NextResponse.json({ error: "Client's email address has hard-bounced. Update it, or send to a different address." }, { status: 422 });
  }

  const today = await todayISO(supabase);
  const statementDate = body.statementDate || today;
  const periodFrom = body.periodFrom || "2000-01-01";
  const periodTo = body.periodTo || today;
  const showDetail = body.detail !== false;

  const activity = await buildAccountStatementData(supabase, {
    clientId,
    orgId: client.org_id as string,
    fromDate: periodFrom,
    toDate: periodTo,
  });

  if (body.minBalanceCents != null && activity.endingBalanceCents < body.minBalanceCents) {
    return NextResponse.json({ skipped: true, endingBalanceCents: activity.endingBalanceCents });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name, brand_color, address, customizations")
    .eq("id", client.org_id)
    .single();

  const addr = (org?.address as Record<string, string>) ?? {};
  const customizations = (org?.customizations as Record<string, unknown>) ?? {};
  const orgName = (org?.name as string) ?? "Your Service Provider";
  const orgPhone = addr.phone ?? "";
  const brandColor = (org?.brand_color as string) || "#60ab45";

  const mergeVars = {
    ...buildClientMergeVars(
      { displayName: client.display_name as string, balanceOutstandingCents: activity.endingBalanceCents },
      { name: orgName, addressPhone: orgPhone, timeZone: await getMyTimeZone(supabase) }
    ),
    "[statementbalance]": formatCents(activity.endingBalanceCents),
  };

  const resolvedSubject = resolveMergeTags(body.subject?.trim() || DEFAULT_SUBJECT, mergeVars);
  const resolvedBodyContent = resolveMergeTags(body.bodyHtml?.trim() || DEFAULT_BODY, mergeVars);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:${brandColor};padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:22px">${orgName}</h1>
    <p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:14px">Account Statement</p>
  </div>
  <div style="padding:28px 32px;font-size:14px;line-height:1.6">${resolvedBodyContent}</div>
  <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8">${orgName}</p>
  </div>
</div>
</body>
</html>`;

  const statementData: AccountStatementPDFData = {
    statementDate,
    periodFrom,
    periodTo,
    accountNumber: activity.accountNumber,
    clientName: (client.display_name as string) ?? null,
    clientAddress: (client.billing_address as string) ?? null,
    clientCity: (client.billing_city as string) ?? null,
    clientState: (client.billing_state as string) ?? null,
    clientZip: (client.billing_zip as string) ?? null,
    message: body.message?.trim() || null,
    balanceForwardCents: activity.balanceForwardCents,
    rows: showDetail ? activity.rows : [],
    endingBalanceCents: activity.endingBalanceCents,
    lastPayment: activity.lastPayment,
  };

  const orgData: OrgPDFData = {
    name: orgName,
    street: addr.street ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    zip: addr.zip ?? "",
    phone: orgPhone,
    brandColor,
    logoUrl: (customizations.logoDataUrl as string) || null,
  };

  let pdfAttachment: { filename: string; content: string } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createElement(AccountStatementDocument as any, { statement: statementData, org: orgData }) as any
    );
    pdfAttachment = {
      filename: `statement-${clientId}.pdf`,
      content: Buffer.from(buffer).toString("base64"),
    };
  } catch (err) {
    // Non-fatal — send the email without the attachment rather than blocking
    // the whole send over a PDF rendering issue.
    console.error("[email-statement] PDF render error:", err);
  }

  const resend = new Resend(process.env.RESEND_API_KEY?.trim());
  const { data: sendData, error: sendErr } = await resend.emails.send({
    from: orgEmailFrom(orgName),
    to: toEmails,
    subject: resolvedSubject,
    html,
    ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
  });

  if (sendErr) {
    log.error("Resend error", { clientId, to: toEmails.join(", "), code: sendErr.name, message: sendErr.message });
    const mapped = mapSendError(sendErr, "the statement");
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  const toEmailsJoined = toEmails.join(", ");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("client_activity").insert({
    org_id: client.org_id,
    client_id: clientId,
    activity_type: "email",
    subject: "Account statement sent via email",
    body: `Sent to ${toEmailsJoined}`,
    sent_to: toEmailsJoined,
    ref_id: clientId,
    ref_table: "clients",
    resend_message_id: sendData?.id ?? null,
    occurred_at: new Date().toISOString(),
    created_by: user.id,
  });

  return NextResponse.json({ ok: true });
}
