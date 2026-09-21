import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoiceDocument } from "@/components/crm/invoices/pdf/InvoiceDocument";
import type { InvoicePDFData, InvoicePDFLineItem, OrgPDFData } from "@/components/crm/invoices/pdf/InvoiceDocument";
import type { InvoicePDFLayoutKey } from "@/types/crm-invoices";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { addParagraphSpacing, resolveMergeTags } from "@/lib/utils/document-template-renderer";
import { buildInvoiceStatementData } from "@/lib/invoices/statement-data";
import { getOrCreateInvoiceShareToken, buildInvoiceViewUrl } from "@/lib/invoices/share-token";
import { pushInvoiceToQuickBooks } from "@/lib/integrations/quickbooks";
import { replyToFromCustomizations } from "@/lib/email/reply-to";
import { orgEmailFrom, mapSendError, buildClientMergeVars } from "@/lib/email/send";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { logger } from "@/lib/logger";

const log = logger.child("email-invoice");

const DEFAULT_SUBJECT = "Invoice #[invoicenumber] from [companyname] — [invoicetotal] due [duedate]";
const DEFAULT_BODY = `<p>Hi [clientfirstname],</p>

<p>Please find attached Invoice #[invoicenumber] from [companyname] for [invoicetotal], due [duedate].</p>

<p>If you have any questions, please don't hesitate to reach out.</p>

<p>Thank you,<br>[salesrepname]<br>[companyphonenumber]</p>`;

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    invoiceId: string;
    to?: string[];
    ccEmails?: string[];
    subject?: string;
    bodyHtml?: string;
    templateId?: string;
    includePdf?: boolean;
  };
  const { invoiceId } = body;
  if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });

  if (body.to?.some((e) => !isValidEmail(e))) {
    return NextResponse.json({ error: "Invalid recipient email address" }, { status: 400 });
  }
  if (body.ccEmails?.some((e) => !isValidEmail(e))) {
    return NextResponse.json({ error: "Invalid CC email address" }, { status: 400 });
  }

  // Load invoice with client, line items, and its own PDF template (if any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inv, error: invErr } = await (supabase as any)
    .from("crm_invoices")
    .select(`
      *,
      clients(
        display_name, first_name, last_name, primary_email, email_bounced_at, phones, account_number,
        invoice_delivery, balance_outstanding_cents, referred_by, referred_by_client_id,
        billing_address, billing_city, billing_state, billing_zip,
        service_address, service_city, service_state, service_zip,
        turf_sqft, gross_sqft, mulch_bed_sqft, yards_of_mulch,
        linear_ft_perimeter, linear_ft_edging, gate_lock_code, notes_to_crew
      ),
      crm_invoice_line_items(*),
      crm_invoice_pdf_templates(layout_key, logo_url, accent_color, show_notes, default_notes, advertisement_text),
      sales_rep:crm_employees!crm_invoices_sales_rep_id_fkey(first_name, last_name)
    `)
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .single();

  if (invErr || !inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const toEmails = (body.to && body.to.length > 0)
    ? body.to.map((e) => e.trim())
    : (inv.clients?.primary_email ? [inv.clients.primary_email as string] : []);
  if (toEmails.length === 0) {
    return NextResponse.json({ error: "Client has no email address on file" }, { status: 422 });
  }
  // A hard bounce means the stored address doesn't accept mail; re-sending
  // damages sending-domain reputation, so it is blocked for transactional mail
  // too (see the Resend webhook that sets email_bounced_at). An explicit `to`
  // override is how staff send to a corrected address, so it is not blocked.
  const usingStoredInvoiceEmail = !(body.to && body.to.length > 0);
  if (usingStoredInvoiceEmail && inv.clients?.email_bounced_at) {
    return NextResponse.json(
      { error: "Client's email address has hard-bounced. Update it, or send to a different address." },
      { status: 422 }
    );
  }

  // Load org + brand color
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = profile?.org_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any).from("organizations").select("name, brand_color, address, customizations").eq("id", profile.org_id).single()
    : { data: null };
  const orgName = org?.name ?? "Your Service Provider";
  const orgAddr = (org?.address as Record<string, string>) ?? {};
  const orgPhone = orgAddr.phone ?? "";

  // Resolve which PDF template to render — an explicit choice for this send
  // wins, then the invoice's own pinned template, then the org default.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfTemplate: any = null;
  if (body.templateId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: chosenTemplate } = await (supabase as any)
      .from("crm_invoice_pdf_templates")
      .select("layout_key, logo_url, accent_color, show_notes, default_notes, advertisement_text")
      .eq("id", body.templateId)
      .eq("org_id", inv.org_id)
      .is("deleted_at", null)
      .maybeSingle();
    pdfTemplate = chosenTemplate ?? null;
  }
  if (!pdfTemplate) pdfTemplate = inv.crm_invoice_pdf_templates ?? null;
  if (!pdfTemplate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: defaultTemplate } = await (supabase as any)
      .from("crm_invoice_pdf_templates")
      .select("layout_key, logo_url, accent_color, show_notes, default_notes, advertisement_text")
      .eq("org_id", inv.org_id)
      .eq("is_default", true)
      .is("deleted_at", null)
      .maybeSingle();
    pdfTemplate = defaultTemplate ?? null;
  }
  const layoutKey: InvoicePDFLayoutKey = (pdfTemplate?.layout_key as InvoicePDFLayoutKey) ?? "default";
  const brandColor = (pdfTemplate?.accent_color as string) || (org?.brand_color as string) || "#60ab45";

  const lineItems: { name: string | null; description: string; qty: number; rate_cents: number; total_cents: number; sort_order: number }[] =
    (inv.crm_invoice_line_items ?? []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);

  const clientDisplayName = (inv.clients?.display_name as string) ?? "";

  // Computed here (not just where the PDF is built below) so the "View &
  // Pay Online" link/button can appear in the actual email body too --
  // previously it only existed inside the attached PDF, so turning off
  // "Include PDF" (or a plain-text-reading client) meant the recipient had
  // no way to reach it at all.
  const shareToken = await getOrCreateInvoiceShareToken(supabase, {
    orgId: inv.org_id as string,
    invoiceId: inv.id as string,
    createdBy: user.id,
  });
  const viewOnlineUrl = shareToken ? buildInvoiceViewUrl(shareToken) : null;

  // The invoice's own sales rep (crm_invoices.sales_rep_id → crm_employees),
  // not the org name — [salesperson]/[salesrepname] previously always showed
  // the company name regardless of who actually sold/owns the account.
  const salesRep = inv.sales_rep as { first_name?: string; last_name?: string } | null;
  const salesRepName = salesRep ? `${salesRep.first_name ?? ""} ${salesRep.last_name ?? ""}`.trim() || orgName : orgName;

  // referred_by_client_id (an existing client referred this one) wins over
  // the freetext referred_by (non-client sources like "Google"/"Yard Sign").
  let referringClientName = (inv.clients?.referred_by as string | null) ?? "";
  if (inv.clients?.referred_by_client_id) {
    const { data: referrer } = await supabase
      .from("clients")
      .select("display_name")
      .eq("id", inv.clients.referred_by_client_id as string)
      .maybeSingle();
    if (referrer?.display_name) referringClientName = referrer.display_name as string;
  }

  // The Documents block-builder's picker for docType "invoice_email" offers a
  // second vocabulary (INVOICE_TAGS in crm-documents.ts) beyond the legacy
  // quick-insert list (INVOICE_EMAIL_MERGE_TAGS) this route was originally
  // built for, plus the full COMMON tag set (client/billing/property/company/
  // system tags — see MERGE_TAGS_BY_TYPE.invoice_email). Reuse the same
  // buildClientMergeVars helper the client/marketing send routes use for that
  // shared vocabulary, rather than re-deriving client/company field
  // resolution a third time. escape: false — the final resolveMergeTags call
  // below already HTML-escapes every non-HTML-safe tag at substitution time.
  const invoiceLogoUrl = (pdfTemplate?.logo_url as string) || (org?.customizations as Record<string, unknown> | undefined)?.logoDataUrl as string | undefined;
  const paymentLinkHtml = viewOnlineUrl
    ? `<a href="${viewOnlineUrl}" style="color:#fff;background:${brandColor};padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block">Pay Now</a>`
    : "";
  const mergeVars: Record<string, string> = {
    ...buildClientMergeVars(
      {
        displayName: clientDisplayName,
        firstName: inv.clients?.first_name ?? null,
        lastName: inv.clients?.last_name ?? null,
        primaryEmail: inv.clients?.primary_email ?? null,
        phones: inv.clients?.phones ?? null,
        accountNumber: inv.clients?.account_number ?? null,
        invoiceDelivery: inv.clients?.invoice_delivery ?? null,
        balanceOutstandingCents: inv.clients?.balance_outstanding_cents ?? null,
        billingAddress: inv.clients?.billing_address ?? null,
        billingCity: inv.clients?.billing_city ?? null,
        billingState: inv.clients?.billing_state ?? null,
        billingZip: inv.clients?.billing_zip ?? null,
        serviceAddress: inv.clients?.service_address ?? null,
        serviceCity: inv.clients?.service_city ?? null,
        serviceState: inv.clients?.service_state ?? null,
        serviceZip: inv.clients?.service_zip ?? null,
        turfSqft: inv.clients?.turf_sqft ?? null,
        grossSqft: inv.clients?.gross_sqft ?? null,
        mulchBedSqft: inv.clients?.mulch_bed_sqft ?? null,
        yardsOfMulch: inv.clients?.yards_of_mulch ?? null,
        linearFtPerimeter: inv.clients?.linear_ft_perimeter ?? null,
        linearFtEdging: inv.clients?.linear_ft_edging ?? null,
        gateLockCode: inv.clients?.gate_lock_code ?? null,
        notesToCrew: inv.clients?.notes_to_crew ?? null,
        salesRepName,
        referringClientName,
      },
      {
        name: orgName,
        timeZone: await getOrgTimeZone(supabase, inv.org_id as string),
        addressPhone: orgPhone,
        addressStreet: orgAddr.street ?? null,
        addressCity: orgAddr.city ?? null,
        addressState: orgAddr.state ?? null,
        addressZip: orgAddr.zip ?? null,
      },
      { escape: false }
    ),
    "[invoicenumber]":      String(inv.invoice_number ?? "—"),
    "[invoicedate]":        fmtDate(inv.invoice_date),
    "[duedate]":            fmtDate(inv.due_date),
    "[invoiceduedate]":     fmtDate(inv.due_date),
    "[invoicesubtotal]":    formatCents((inv.subtotal_cents as number) ?? 0),
    "[invoicetax]":         formatCents((inv.tax_cents as number) ?? 0),
    "[invoicetotal]":       formatCents(inv.total_cents ?? 0),
    "[balancedue]":         formatCents(inv.balance_cents ?? 0),
    "[invoicebalance]":     formatCents(inv.balance_cents ?? 0),
    "[salesrepname]":       salesRepName,
    "[viewinvoiceonline]":  viewOnlineUrl ?? "",
    "[paymentlink]":        paymentLinkHtml,
    "[invoicelogo]":        invoiceLogoUrl ? `<img src="${invoiceLogoUrl}" alt="${orgName}" style="max-height:48px" />` : "",
    "[invoicegrid]":        "",
  };

  const resolvedSubject = resolveMergeTags(body.subject?.trim() || DEFAULT_SUBJECT, mergeVars);
  const resolvedBodyContent = addParagraphSpacing(resolveMergeTags(body.bodyHtml?.trim() || DEFAULT_BODY, mergeVars));

  // "Include PDF" — the template's setting, forwarded by the send dialog.
  // Defaults to true (PDF attached) to preserve prior behavior when no
  // template is selected.
  const includePdf = body.includePdf !== false;

  // Wrap the (rich-text-authored) body in the same branded shell the PDF uses,
  // so the emailed invoice's header color always matches the attached PDF.
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:${brandColor};padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:22px">${orgName}</h1>
    <p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:14px">Invoice #${inv.invoice_number ?? "—"}</p>
  </div>
  <div style="padding:28px 32px;font-size:14px;line-height:1.6">${resolvedBodyContent}</div>
  ${viewOnlineUrl ? `
  <div style="padding:0 32px 28px;text-align:center">
    <a href="${viewOnlineUrl}" style="display:inline-block;background:${brandColor};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600">View &amp; Pay Invoice Online</a>
  </div>` : ""}
  <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8">${orgName}</p>
  </div>
</div>
</body>
</html>`;

  // Render the invoice PDF for attachment — same pipeline as the "Print"/
  // "Download PDF" buttons (src/app/api/crm/invoices/[id]/pdf/route.ts).
  const pdfLineItems: InvoicePDFLineItem[] = lineItems.map((li) => ({
    name: li.name,
    description: li.description ?? "",
    qty: Number(li.qty) || 1,
    rateCents: li.rate_cents ?? 0,
    totalCents: li.total_cents ?? 0,
  }));
  const addr = (org?.address as Record<string, string>) ?? {};
  const customizations = (org?.customizations as Record<string, unknown>) ?? {};
  const statement = (
    layoutKey === "statement" ||
    layoutKey === "statement_no_stub" ||
    layoutKey === "statement_invoice_only" ||
    layoutKey === "statement_invoice_only_no_stub"
  )
    ? await buildInvoiceStatementData(supabase, {
        id: inv.id as string,
        client_id: (inv.client_id as string | null) ?? null,
        org_id: inv.org_id as string,
        total_cents: (inv.total_cents as number) ?? 0,
        balance_cents: (inv.balance_cents as number) ?? 0,
        invoice_date: (inv.invoice_date as string | null) ?? null,
      })
    : null;
  const invoicePdfData: InvoicePDFData = {
    invoiceNumber: inv.invoice_number as number,
    description: inv.description as string | null,
    invoiceDate: inv.invoice_date as string,
    dueDate: inv.due_date as string | null,
    poNumber: inv.po_number as string | null,
    terms: inv.terms as string | null,
    notes: pdfTemplate?.show_notes === false
      ? null
      : ((inv.notes as string | null) || (pdfTemplate?.default_notes as string | null) || null),
    advertisementText: (pdfTemplate?.advertisement_text as string | null) ?? null,
    viewOnlineUrl,
    clientName: inv.clients?.display_name ?? null,
    clientAddress: inv.clients?.billing_address ?? null,
    clientCity: inv.clients?.billing_city ?? null,
    clientState: inv.clients?.billing_state ?? null,
    clientZip: inv.clients?.billing_zip ?? null,
    subtotalCents: (inv.subtotal_cents as number) ?? 0,
    taxRateBps: (inv.tax_rate_bps as number) ?? 0,
    taxCents: (inv.tax_cents as number) ?? 0,
    discountCents: (inv.discount_cents as number) ?? 0,
    totalCents: (inv.total_cents as number) ?? 0,
    amountPaidCents: (inv.amount_paid_cents as number) ?? 0,
    balanceCents: (inv.balance_cents as number) ?? 0,
    lineItems: pdfLineItems,
    statement,
  };
  const orgPdfData: OrgPDFData = {
    name: orgName,
    street: addr.street ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    zip: addr.zip ?? "",
    phone: orgPhone,
    brandColor,
    logoUrl: (pdfTemplate?.logo_url as string) || (customizations.logoDataUrl as string) || null,
  };

  let pdfAttachment: { filename: string; content: string } | null = null;
  if (includePdf) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createElement(InvoiceDocument as any, { invoice: invoicePdfData, org: orgPdfData, layoutKey }) as any
      );
      pdfAttachment = {
        filename: `invoice-${inv.invoice_number ?? invoiceId}.pdf`,
        content: Buffer.from(buffer).toString("base64"),
      };
    } catch (err) {
      // Non-fatal — send the email without the attachment rather than blocking
      // the whole send over a PDF rendering issue.
      console.error("[email-invoice] PDF render error:", err);
    }
  }

  const replyTo = replyToFromCustomizations(org?.customizations);
  const resend = new Resend(process.env.RESEND_API_KEY?.trim());
  const { data: sendData, error: sendErr } = await resend.emails.send({
    from: orgEmailFrom(org?.name),
    to: toEmails,
    subject: resolvedSubject,
    html,
    ...(replyTo ? { replyTo } : {}),
    ...(body.ccEmails && body.ccEmails.length > 0 ? { cc: body.ccEmails } : {}),
    ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
  });

  if (sendErr) {
    // Same mapping as the estimate send route: an undeliverable/rejected
    // address is a 422 carrying the provider's reason (so the toast can say
    // WHY), quota is 429, anything else is a 502 — never a bare 500.
    log.error("Resend error", { invoiceId, to: toEmails.join(", "), code: sendErr.name, message: sendErr.message });
    const mapped = mapSendError(sendErr, "the invoice");
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  const toEmailsJoined = toEmails.join(", ");

  // Update invoice status to "sent" if it hasn't been emailed yet. "printed" is
  // included so a "both" delivery-method client's invoice — printed first, then
  // emailed — correctly progresses instead of staying stuck at "printed" forever.
  if (inv.status === "draft" || inv.status === "printed") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("crm_invoices").update({ status: "sent" }).eq("id", invoiceId);
  }

  // Push to QuickBooks now that the invoice has gone out — never throws, so
  // a QuickBooks outage can't fail an invoice send.
  if (profile?.org_id) {
    await pushInvoiceToQuickBooks(supabase, profile.org_id, invoiceId);
  }

  if (inv.client_id && profile?.org_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await fireSimpleTrigger(supabase as any, { orgId: profile.org_id, clientId: inv.client_id, invoiceId, triggerType: "invoice_sent" });
  }

  // Log activity
  if (inv.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("client_activity").insert({
      org_id: profile?.org_id,
      client_id: inv.client_id,
      activity_type: "email",
      subject: `Invoice #${inv.invoice_number} sent via email`,
      body: `Sent to ${toEmailsJoined}`,
      sent_to: toEmailsJoined,
      ref_id: invoiceId,
      ref_table: "crm_invoices",
      resend_message_id: sendData?.id ?? null,
      occurred_at: new Date().toISOString(),
      created_by: user.id,
    });
  }

  return NextResponse.json({ ok: true });
}
