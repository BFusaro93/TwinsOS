import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public route — no auth. Uses service role to read across RLS, but every
// query below is scoped by the token-resolved invoice/org id, never by
// anything the client supplies directly.
const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = serviceClient();

  const { data: shareToken, error: tokenErr } = await supabase
    .from("invoice_share_tokens")
    .select("*")
    .eq("token", token)
    .single();

  if (tokenErr || !shareToken) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invoice link has expired" }, { status: 410 });
  }

  // Fire-and-forget view tracking.
  supabase
    .from("invoice_share_tokens")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", shareToken.id)
    .then(() => {/* intentionally ignored */});

  const { data: inv, error: invErr } = await supabase
    .from("crm_invoices")
    .select(`
      id, invoice_number, description, invoice_date, due_date, status,
      subtotal_cents, tax_cents, discount_cents, total_cents, amount_paid_cents, balance_cents,
      clients(display_name, billing_address, billing_city, billing_state, billing_zip),
      crm_invoice_line_items(*)
    `)
    .eq("id", shareToken.invoice_id)
    .is("deleted_at", null)
    .single();

  if (invErr || !inv) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name, brand_color, address, customizations")
    .eq("id", shareToken.org_id)
    .single();

  const lineItems = ((inv.crm_invoice_line_items ?? []) as Record<string, unknown>[])
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    .map((li) => ({
      name: li.name as string | null,
      description: (li.description as string) ?? "",
      qty: Number(li.qty) || 1,
      rateCents: (li.rate_cents as number) ?? 0,
      totalCents: (li.total_cents as number) ?? 0,
    }));

  return NextResponse.json({
    invoiceNumber: inv.invoice_number,
    description: inv.description,
    invoiceDate: inv.invoice_date,
    dueDate: inv.due_date,
    status: inv.status,
    subtotalCents: inv.subtotal_cents,
    taxCents: inv.tax_cents,
    discountCents: inv.discount_cents,
    totalCents: inv.total_cents,
    amountPaidCents: inv.amount_paid_cents,
    balanceCents: inv.balance_cents,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientName: (inv.clients as any)?.display_name ?? null,
    lineItems,
    org: {
      name: org?.name ?? "",
      brandColor: (org?.brand_color as string) ?? "#60ab45",
      logoUrl: ((org?.customizations as Record<string, unknown>)?.logoDataUrl as string) ?? null,
    },
  });
}
