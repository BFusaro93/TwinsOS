import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { computeMergedInvoiceTotals } from "@/lib/invoice-merge";

const MergeSchema = z
  .object({
    parentId: z.string().uuid(),
    childIds: z.array(z.string().uuid()).min(1),
  })
  .refine((v) => new Set(v.childIds).size === v.childIds.length && !v.childIds.includes(v.parentId), {
    message: "Each invoice can only be merged once, and not into itself",
  });

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = MergeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { parentId, childIds } = parsed.data;

  const allIds = [parentId, ...childIds];

  const { data: profile } = await supabase.from("profiles").select("org_id, name").eq("id", user.id).single();
  const orgId: string | null = profile?.org_id ?? null;
  const actorName: string = profile?.name ?? user.email ?? "System";

  // Load all invoices to validate same client and not voided
  const { data: invoices, error: fetchErr } = await supabase
    .from("crm_invoices")
    .select("id, client_id, status, tax_rate_bps, invoice_number, amount_paid_cents, discount_cents, locked")
    .in("id", allIds)
    .eq("org_id", orgId)
    .is("deleted_at", null);

  if (fetchErr || !invoices || invoices.length !== allIds.length) {
    return NextResponse.json({ error: "One or more invoices not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv = invoices as any[];
  const clientIds = new Set(inv.map((i) => i.client_id));
  if (clientIds.size > 1) {
    return NextResponse.json({ error: "All invoices must belong to the same client" }, { status: 422 });
  }

  const voidedIds = inv.filter((i) => i.status === "void").map((i) => i.id);
  if (voidedIds.length > 0) {
    return NextResponse.json({ error: "Cannot merge voided invoices" }, { status: 422 });
  }

  // A locked invoice (printed/sent, meant to be immutable per accounting
  // conventions — see InvoiceDetail.tsx's lock toggle) must not have its
  // totals rewritten (as parent) or be voided out from under a client who
  // may already have a copy of it (as child). Without this check, merge
  // silently bypassed the entire locking mechanism.
  const lockedIds = inv.filter((i) => i.locked).map((i) => `#${i.invoice_number}`);
  if (lockedIds.length > 0) {
    return NextResponse.json(
      { error: `Cannot merge locked invoice${lockedIds.length > 1 ? "s" : ""} (${lockedIds.join(", ")}). Unlock ${lockedIds.length > 1 ? "them" : "it"} first.` },
      { status: 422 }
    );
  }

  // Fetch ALL line items for parent + children BEFORE reassigning.
  // Note: crm_invoice_line_items has no deleted_at column — do not filter on it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allItems, error: itemsFetchErr } = await (supabase as any)
    .from("crm_invoice_line_items")
    .select("total_cents, discount_cents, is_taxable")
    .in("invoice_id", allIds)
    .eq("org_id", orgId);

  if (itemsFetchErr) return NextResponse.json({ error: `Line item fetch failed: ${itemsFetchErr.message}` }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (allItems ?? []) as { total_cents: number; discount_cents: number | null; is_taxable: boolean }[];
  const parentInv = inv.find((i) => i.id === parentId);
  const taxRateBps: number = parentInv?.tax_rate_bps ?? 0;

  // Shared with MergeInvoicesDialog.tsx's preview so the number shown before
  // confirming a merge always matches what actually gets saved: net line
  // items summed across every merged invoice, every invoice's own
  // document-level discount combined, and tax applied only at the PARENT's
  // rate against the combined net-of-discount taxable base (same fix as
  // use-invoices.ts's useUpdateInvoiceFinancials — charging tax on the
  // pre-discount amount overcharges the customer).
  const {
    subtotalCents: subtotal,
    discountCents: combinedDiscountCents,
    taxCents,
    totalCents: total,
  } = computeMergedInvoiceTotals(
    items.map((li) => ({ totalCents: li.total_cents, discountCents: li.discount_cents, isTaxable: li.is_taxable })),
    inv.map((i) => ({ discountCents: i.discount_cents, amountPaidCents: i.amount_paid_cents })),
    taxRateBps
  );

  // Every write — line items, parent totals, allocations, legacy payment
  // links, zeroing and voiding the children, the parent's paid/balance/status
  // — happens in ONE transaction (crm_merge_invoices, 20260927100300). This
  // used to be six separate writes, and the last one (voiding the children)
  // was rejected by crm_invoice_block_void_with_payments for any child with a
  // payment, because only its allocations had been moved and not its
  // amount_paid_cents — leaving line items and money on the parent and the
  // children still live: a half-merge. The RPC runs as the caller (RLS
  // applies), re-validates everything under row locks, and rolls back whole
  // on any failure.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: mergeErr } = await (supabase as any).rpc("crm_merge_invoices", {
    p_parent_id: parentId,
    p_child_ids: childIds,
    p_subtotal_cents: subtotal,
    p_discount_cents: combinedDiscountCents,
    p_tax_cents: taxCents,
    p_total_cents: total,
  });
  if (mergeErr) {
    // Validation failures raised by the RPC (paid more than the merged total,
    // payments on a draft parent, ...) are user-facing; nothing was written.
    return NextResponse.json({ error: mergeErr.message ?? "Merge failed" }, { status: 422 });
  }

  // Update the parent invoice's client_activity entry with the real post-merge total
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("client_activity")
    .update({ amount_cents: total })
    .eq("ref_id", parentId)
    .eq("activity_type", "invoice");

  // Audit trail
  const mergedNumbers = inv.filter((i) => childIds.includes(i.id)).map((i) => `#${i.invoice_number}`).join(", ");
  if (orgId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc("server_insert_audit", {
      p_org_id: orgId,
      p_record_type: "invoice",
      p_record_id: parentId,
      p_action: "updated",
      p_description: `Merged invoice${childIds.length > 1 ? "s" : ""} ${mergedNumbers} into this invoice. New total: $${(total / 100).toFixed(2)}.`,
      p_created_by: user.id,
      p_user_name: actorName,
    });
  }

  return NextResponse.json({ ok: true, parentId });
}
