import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";

const MergeSchema = z.object({
  parentId: z.string().uuid(),
  childIds: z.array(z.string().uuid()).min(1),
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any).from("profiles").select("org_id, name").eq("id", user.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgId: string | null = (profile as any)?.org_id ?? null;
  const actorName: string = (profile as any)?.name ?? user.email ?? "System";

  // Load all invoices to validate same client and not voided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoices, error: fetchErr } = await (supabase as any)
    .from("crm_invoices")
    .select("id, client_id, status, tax_rate_bps, invoice_number, amount_paid_cents")
    .in("id", allIds)
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

  // Fetch ALL line items for parent + children BEFORE reassigning.
  // Note: crm_invoice_line_items has no deleted_at column — do not filter on it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allItems, error: itemsFetchErr } = await (supabase as any)
    .from("crm_invoice_line_items")
    .select("total_cents, is_taxable")
    .in("invoice_id", allIds);

  if (itemsFetchErr) return NextResponse.json({ error: `Line item fetch failed: ${itemsFetchErr.message}` }, { status: 500 });

  // Reassign all line items from child invoices to the parent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: liErr } = await (supabase as any)
    .from("crm_invoice_line_items")
    .update({ invoice_id: parentId })
    .in("invoice_id", childIds);

  if (liErr) return NextResponse.json({ error: liErr.message }, { status: 500 });

  // Reassign payment records pointed at a child invoice to the parent too —
  // otherwise a child's already-collected payment stays "on" a
  // soft-deleted/voided invoice and is lost from the merged balance below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: allocErr } = await (supabase as any)
    .from("crm_payment_allocations")
    .update({ invoice_id: parentId })
    .in("invoice_id", childIds);
  if (allocErr) return NextResponse.json({ error: allocErr.message }, { status: 500 });

  // Legacy payments predating crm_payment_allocations link directly via
  // crm_payments.invoice_id — reassign those too.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: legacyPmtErr } = await (supabase as any)
    .from("crm_payments")
    .update({ invoice_id: parentId })
    .in("invoice_id", childIds);
  if (legacyPmtErr) return NextResponse.json({ error: legacyPmtErr.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (allItems ?? []) as { total_cents: number; is_taxable: boolean }[];
  const subtotal = items.reduce((s, li) => s + li.total_cents, 0);
  const parentInv = inv.find((i) => i.id === parentId);
  const taxRateBps: number = parentInv?.tax_rate_bps ?? 0;
  const taxableBase = items.filter((li) => li.is_taxable).reduce((s, li) => s + li.total_cents, 0);
  const taxCents = Math.round((taxableBase * taxRateBps) / 10000);
  const total = subtotal + taxCents;

  // Sum paid amounts across ALL merged invoices, not just the parent's own —
  // a child invoice that was already paid off would otherwise have that
  // payment vanish from the merged balance (the child's own row is about to
  // be voided below).
  const alreadyPaid: number = inv.reduce((s, i) => s + (i.amount_paid_cents ?? 0), 0);
  const newBalance = Math.max(0, total - alreadyPaid);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: parentErr } = await (supabase as any)
    .from("crm_invoices")
    .update({ subtotal_cents: subtotal, tax_cents: taxCents, total_cents: total, balance_cents: newBalance, amount_paid_cents: alreadyPaid })
    .eq("id", parentId);

  if (parentErr) return NextResponse.json({ error: parentErr.message }, { status: 500 });

  // Soft-delete the child invoices
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: deleteErr } = await (supabase as any)
    .from("crm_invoices")
    .update({ deleted_at: new Date().toISOString(), status: "void" })
    .in("id", childIds);

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

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
