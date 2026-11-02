import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeInvoiceTotals } from "@/lib/invoices/totals";
import { logger } from "@/lib/logger";

const log = logger.child("crm invoice refresh draft totals");

/**
 * POST /api/crm/invoices/[id]/refresh-draft-totals — re-derives a DRAFT invoice's header
 * totals from its saved lines.
 *
 * Line items autosave but the header totals only move on Save Invoice, so printing a draft
 * first needs them refreshed. A role that can print but not edit invoices
 * (acct_add_modify_invoices) may not write invoice amounts under its own session (DB guard),
 * which left the invoice locked but stuck in draft. The email route recomputes as the service
 * role for the same reason; this is the same step for Print. Drafts only: a sent invoice's
 * amounts never change here.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: orgId } = await supabase.rpc("my_org_id");
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Read through the user's session so RLS decides whether they can see this invoice.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inv } = await (supabase as any)
    .from("crm_invoices")
    .select("id, status, amount_paid_cents, tax_rate_bps, discount_cents, discount_type, discount_value, subtotal_cents, total_cents, crm_invoice_line_items(total_cents, discount_cents, is_taxable)")
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (inv.status !== "draft") return NextResponse.json({ ok: true, changed: false });

  const lines = (inv.crm_invoice_line_items ?? []) as { total_cents: number | null; discount_cents: number | null; is_taxable: boolean | null }[];
  const computed = computeInvoiceTotals({
    lines: lines.map((li) => ({ totalCents: li.total_cents ?? 0, discountCents: li.discount_cents ?? 0, isTaxable: !!li.is_taxable })),
    discountCents: inv.discount_cents ?? 0,
    discountType: inv.discount_type ?? null,
    discountValue: inv.discount_value ?? null,
    taxRateBps: inv.tax_rate_bps ?? 0,
  });
  if (computed.totalCents === (inv.total_cents ?? 0) && computed.subtotalCents === (inv.subtotal_cents ?? 0)) {
    return NextResponse.json({ ok: true, changed: false });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createServiceClient() as any)
    .from("crm_invoices")
    .update({
      subtotal_cents: computed.subtotalCents,
      discount_cents: computed.discountCents,
      tax_cents: computed.taxCents,
      total_cents: computed.totalCents,
      balance_cents: Math.max(0, computed.totalCents - (inv.amount_paid_cents ?? 0)),
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("status", "draft");
  if (error) {
    log.error("draft totals refresh failed", { invoiceId: id, error: error.message });
    return NextResponse.json({ error: "Could not update the invoice totals" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, changed: true });
}
