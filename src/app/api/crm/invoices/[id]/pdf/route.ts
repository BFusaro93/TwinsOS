import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoiceDocument } from "@/components/crm/invoices/pdf/InvoiceDocument";
import type { InvoicePDFData, InvoicePDFLineItem, OrgPDFData } from "@/components/crm/invoices/pdf/InvoiceDocument";
import type { InvoicePDFLayoutKey } from "@/types/crm-invoices";
import { buildInvoiceStatementData } from "@/lib/invoices/statement-data";
import { getOrCreateInvoiceShareToken, buildInvoiceViewUrl } from "@/lib/invoices/share-token";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── fetch invoice ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inv, error: invErr } = await (supabase as any)
    .from("crm_invoices")
    .select(`
      *,
      clients(display_name, billing_address, billing_city, billing_state, billing_zip),
      crm_invoice_line_items(*),
      crm_invoice_pdf_templates(layout_key, logo_url, accent_color, show_notes, default_notes, advertisement_text)
    `)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (invErr || !inv) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // ── resolve which template to render ─────────────────────────────────────────
  // Invoice's own pdf_template_id wins; otherwise fall back to the org's default template.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let template: any = inv.crm_invoice_pdf_templates ?? null;
  if (!template) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: defaultTemplate } = await (supabase as any)
      .from("crm_invoice_pdf_templates")
      .select("layout_key, logo_url, accent_color, show_notes, default_notes, advertisement_text")
      .eq("org_id", inv.org_id)
      .eq("is_default", true)
      .is("deleted_at", null)
      .maybeSingle();
    template = defaultTemplate ?? null;
  }
  const layoutKey: InvoicePDFLayoutKey = (template?.layout_key as InvoicePDFLayoutKey) ?? "default";

  // ── fetch org settings ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name, brand_color, address, customizations")
    .eq("id", inv.org_id)
    .single();

  // ── build data shapes ───────────────────────────────────────────────────────
  const lineItems: InvoicePDFLineItem[] = (inv.crm_invoice_line_items ?? [])
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
    )
    .map((li: Record<string, unknown>) => ({
      name: li.name as string | null,
      description: (li.description as string) ?? "",
      qty: Number(li.qty) || 1,
      rateCents: (li.rate_cents as number) ?? 0,
      totalCents: (li.total_cents as number) ?? 0,
    }));

  const addr = (org?.address as Record<string, string>) ?? {};
  const customizations = (org?.customizations as Record<string, unknown>) ?? {};

  const statement = (layoutKey === "statement" || layoutKey === "statement_invoice_only")
    ? await buildInvoiceStatementData(supabase, {
        id: inv.id as string,
        client_id: (inv.client_id as string | null) ?? null,
        org_id: inv.org_id as string,
        total_cents: (inv.total_cents as number) ?? 0,
        balance_cents: (inv.balance_cents as number) ?? 0,
        invoice_date: (inv.invoice_date as string | null) ?? null,
      })
    : null;

  const shareToken = await getOrCreateInvoiceShareToken(supabase, {
    orgId: inv.org_id as string,
    invoiceId: inv.id as string,
    createdBy: user.id,
  });

  const invoiceData: InvoicePDFData = {
    invoiceNumber: inv.invoice_number as number,
    description: inv.description as string | null,
    invoiceDate: inv.invoice_date as string,
    dueDate: inv.due_date as string | null,
    poNumber: inv.po_number as string | null,
    terms: inv.terms as string | null,
    notes: template?.show_notes === false
      ? null
      : ((inv.notes as string | null) || (template?.default_notes as string | null) || null),
    advertisementText: (template?.advertisement_text as string | null) ?? null,
    viewOnlineUrl: shareToken ? buildInvoiceViewUrl(shareToken) : null,
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
    lineItems,
    statement,
  };

  const orgData: OrgPDFData = {
    name: (org?.name as string) ?? "",
    street: addr.street ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    zip: addr.zip ?? "",
    phone: addr.phone ?? "",
    brandColor: (template?.accent_color as string) || (org?.brand_color as string) || "#60ab45",
    logoUrl: (template?.logo_url as string) || (customizations.logoDataUrl as string) || null,
  };

  // ── render ──────────────────────────────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createElement(InvoiceDocument as any, { invoice: invoiceData, org: orgData, layoutKey }) as any
    );

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoice-${invoiceData.invoiceNumber}.pdf"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("PDF render error:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
