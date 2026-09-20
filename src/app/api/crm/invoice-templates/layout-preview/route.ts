import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoiceDocument } from "@/components/crm/invoices/pdf/InvoiceDocument";
import type { InvoicePDFData, OrgPDFData } from "@/components/crm/invoices/pdf/InvoiceDocument";
import type { InvoicePDFLayoutKey } from "@/types/crm-invoices";
import { SAMPLE_INVOICE } from "@/lib/invoices/sample-invoice";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

const VALID_LAYOUT_KEYS: InvoicePDFLayoutKey[] = [
  "default",
  "compact",
  "statement",
  "statement_no_stub",
  "statement_invoice_only",
  "statement_invoice_only_no_stub",
];

/** Renders any layout key against sample data using the caller's own org
 *  branding (logo/brand color) — for the "compare formats" gallery in
 *  Settings, where there's no saved template row yet to preview from. */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedLayout = req.nextUrl.searchParams.get("layoutKey");
  const layoutKey: InvoicePDFLayoutKey = VALID_LAYOUT_KEYS.includes(requestedLayout as InvoicePDFLayoutKey)
    ? (requestedLayout as InvoicePDFLayoutKey)
    : "default";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name, brand_color, address, customizations")
    .eq("id", profile.org_id)
    .single();

  const addr = (org?.address as Record<string, string>) ?? {};
  const customizations = (org?.customizations as Record<string, unknown>) ?? {};

  const invoiceData: InvoicePDFData = {
    ...SAMPLE_INVOICE,
    invoiceNumber: 1001,
    invoiceDate: todayInZone(await getOrgTimeZone(supabase, profile.org_id)),
  };

  const orgData: OrgPDFData = {
    name: (org?.name as string) || "Your Company",
    street: addr.street ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    zip: addr.zip ?? "",
    phone: addr.phone ?? "",
    brandColor: (org?.brand_color as string) || "#60ab45",
    logoUrl: (customizations.logoDataUrl as string) || null,
  };

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
        "Content-Disposition": "inline; filename=\"layout-preview.pdf\"",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("Layout preview render error:", err);
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 500 });
  }
}
