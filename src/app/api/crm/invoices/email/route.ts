import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoiceDocument } from "@/components/crm/invoices/pdf/InvoiceDocument";
import type { InvoicePDFData, InvoicePDFLineItem, OrgPDFData } from "@/components/crm/invoices/pdf/InvoiceDocument";
import type { InvoicePDFLayoutKey } from "@/types/crm-invoices";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { addParagraphSpacing } from "@/lib/utils/document-template-renderer";
import { buildInvoiceStatementData } from "@/lib/invoices/statement-data";

const FROM = "Twins Lawn Service <noreply@twinslawnservice.com>";

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

function resolveMergeTags(template: string, vars: Record<string, string>): string {
  return template.replace(/\[(\w+)\]/g, (match) => {
    const key = match.toLowerCase();
    return vars[key] ?? match;
  });
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

  // Load invoice with client, line items, and its own PDF template (if any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inv, error: invErr } = await (supabase as any)
    .from("crm_invoices")
    .select(`
      *,
      clients(display_name, primary_email, billing_address, billing_city, billing_state, billing_zip),
      crm_invoice_line_items(*),
      crm_invoice_pdf_templates(layout_key, logo_url, accent_color, show_notes)
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

  // Load org + brand color
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = profile?.org_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any).from("organizations").select("name, brand_color, address, customizations").eq("id", profile.org_id).single()
    : { data: null };
  const orgName = org?.name ?? "Your Service Provider";
  const orgPhone = ((org?.address as Record<string, string>) ?? {}).phone ?? "";

  // Resolve which PDF template to render — invoice's own wins, else org default.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfTemplate: any = inv.crm_invoice_pdf_templates ?? null;
  if (!pdfTemplate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: defaultTemplate } = await (supabase as any)
      .from("crm_invoice_pdf_templates")
      .select("layout_key, logo_url, accent_color, show_notes")
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
  const firstName = clientDisplayName.split(" ")[0] ?? clientDisplayName;
  const lastName = clientDisplayName.split(" ").slice(1).join(" ") ?? "";

  const mergeVars: Record<string, string> = {
    "[clientfirstname]":    firstName,
    "[clientlastname]":     lastName,
    "[clientfullname]":     clientDisplayName,
    "[companyname]":        orgName,
    "[invoicenumber]":      String(inv.invoice_number ?? "—"),
    "[invoicedate]":        fmtDate(inv.invoice_date),
    "[duedate]":            fmtDate(inv.due_date),
    "[invoicetotal]":       formatCents(inv.total_cents ?? 0),
    "[balancedue]":         formatCents(inv.balance_cents ?? 0),
    "[salesrepname]":       orgName,
    "[companyphonenumber]": orgPhone,
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
  const statement = layoutKey === "statement"
    ? await buildInvoiceStatementData(supabase, {
        id: inv.id as string,
        client_id: (inv.client_id as string | null) ?? null,
        org_id: inv.org_id as string,
        total_cents: (inv.total_cents as number) ?? 0,
      })
    : null;
  const invoicePdfData: InvoicePDFData = {
    invoiceNumber: inv.invoice_number as number,
    description: inv.description as string | null,
    invoiceDate: inv.invoice_date as string,
    dueDate: inv.due_date as string | null,
    poNumber: inv.po_number as string | null,
    terms: inv.terms as string | null,
    notes: pdfTemplate?.show_notes === false ? null : (inv.notes as string | null),
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

  const resend = new Resend(process.env.RESEND_API_KEY?.trim());
  const { data: sendData, error: sendErr } = await resend.emails.send({
    from: FROM,
    to: toEmails,
    subject: resolvedSubject,
    html,
    ...(body.ccEmails && body.ccEmails.length > 0 ? { cc: body.ccEmails } : {}),
    ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
  });

  if (sendErr) {
    console.error("[email-invoice] Resend error:", sendErr);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  const toEmailsJoined = toEmails.join(", ");

  // Update invoice status to "sent" if it hasn't been emailed yet. "printed" is
  // included so a "both" delivery-method client's invoice — printed first, then
  // emailed — correctly progresses instead of staying stuck at "printed" forever.
  if (inv.status === "draft" || inv.status === "printed") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("crm_invoices").update({ status: "sent" }).eq("id", invoiceId);
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
