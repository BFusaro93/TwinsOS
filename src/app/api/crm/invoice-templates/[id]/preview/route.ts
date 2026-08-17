import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoiceDocument } from "@/components/crm/invoices/pdf/InvoiceDocument";
import type { InvoicePDFData, OrgPDFData } from "@/components/crm/invoices/pdf/InvoiceDocument";
import type { InvoicePDFLayoutKey } from "@/types/crm-invoices";

// Renders a template against sample data so it can be previewed in Settings
// without needing a real invoice — same renderer and override precedence as
// the real invoice PDF route (/api/crm/invoices/[id]/pdf).
const SAMPLE_INVOICE: Omit<InvoicePDFData, "invoiceNumber" | "invoiceDate"> = {
  description: "Sample Invoice",
  dueDate: null,
  poNumber: null,
  terms: "Due on receipt",
  notes: "Thank you for your business! This is a sample note to show where notes appear on the invoice.",
  clientName: "Jane Sample Client",
  clientAddress: "123 Example Street",
  clientCity: "Springfield",
  clientState: "MA",
  clientZip: "01101",
  subtotalCents: 45000,
  taxRateBps: 625,
  taxCents: 2813,
  discountCents: 0,
  totalCents: 47813,
  amountPaidCents: 0,
  balanceCents: 47813,
  lineItems: [
    { name: "Lawn Mowing", description: "Weekly mowing service", qty: 4, rateCents: 7500, totalCents: 30000 },
    { name: "Mulch Install", description: "3 yards double-shredded mulch", qty: 1, rateCents: 15000, totalCents: 15000 },
  ],
  statement: {
    accountNumber: "10042",
    previousBalanceCents: 47813,
    accountBalanceCents: 95626,
    lastPayment: { amountCents: 47813, date: new Date().toISOString().slice(0, 10), reference: "7219443587" },
    priorInvoice: { invoiceNumber: 1000, amountCents: 47813, daysPastDue: 1 },
  },
};

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: template, error: templateErr } = await (supabase as any)
    .from("crm_invoice_pdf_templates")
    .select("org_id, layout_key, logo_url, accent_color, show_notes, default_notes, advertisement_text")
    .eq("id", id)
    .single();

  if (templateErr || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name, brand_color, address, customizations")
    .eq("id", template.org_id)
    .single();

  const addr = (org?.address as Record<string, string>) ?? {};
  const customizations = (org?.customizations as Record<string, unknown>) ?? {};

  const invoiceData: InvoicePDFData = {
    ...SAMPLE_INVOICE,
    invoiceNumber: 1001,
    invoiceDate: new Date().toISOString().slice(0, 10),
    notes: template.show_notes === false
      ? null
      : ((template.default_notes as string | null) || SAMPLE_INVOICE.notes),
    advertisementText: (template.advertisement_text as string | null) ?? null,
  };

  const orgData: OrgPDFData = {
    name: (org?.name as string) || "Your Company",
    street: addr.street ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    zip: addr.zip ?? "",
    phone: addr.phone ?? "",
    brandColor: (template.accent_color as string) || (org?.brand_color as string) || "#60ab45",
    logoUrl: (template.logo_url as string) || (customizations.logoDataUrl as string) || null,
  };

  const layoutKey = (template.layout_key as InvoicePDFLayoutKey) ?? "default";

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
        "Content-Disposition": "inline; filename=\"template-preview.pdf\"",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("Template preview render error:", err);
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 500 });
  }
}
