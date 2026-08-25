import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/integrations/quickbooks/sync-status — feeds the Settings >
 * Accounting "Sync Status" panel (Phase 4). Lists every invoice and
 * payment allocation that has a recorded qbo_sync_error, for manual
 * retry. Records that simply haven't been attempted yet (both error
 * columns null) are not failures and are excluded.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: integration } = await (supabase as any)
    .from("integrations")
    .select("enabled, last_sync_status, last_sync_at")
    .eq("org_id", profile.org_id)
    .eq("provider", "quickbooks")
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: failedInvoices } = await (supabase as any)
    .from("crm_invoices")
    .select("id, invoice_number, qbo_sync_error, qbo_sync_attempted_at, clients (display_name)")
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .not("qbo_sync_error", "is", null)
    .order("qbo_sync_attempted_at", { ascending: false })
    .limit(100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: failedAllocations } = await (supabase as any)
    .from("crm_payment_allocations")
    .select(`
      id, payment_id, amount_cents, qbo_sync_error, qbo_sync_attempted_at,
      crm_payments (id, client_id, clients (display_name)),
      crm_invoices (invoice_number)
    `)
    .eq("org_id", profile.org_id)
    .not("qbo_sync_error", "is", null)
    .order("qbo_sync_attempted_at", { ascending: false })
    .limit(100);

  return NextResponse.json({
    connected: Boolean(integration?.enabled),
    lastSyncStatus: integration?.last_sync_status ?? null,
    lastSyncAt: integration?.last_sync_at ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    failedInvoices: (failedInvoices ?? []).map((inv: any) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      clientName: inv.clients?.display_name ?? null,
      error: inv.qbo_sync_error,
      attemptedAt: inv.qbo_sync_attempted_at,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    failedPayments: (failedAllocations ?? []).map((a: any) => ({
      allocationId: a.id,
      paymentId: a.payment_id,
      invoiceNumber: a.crm_invoices?.invoice_number ?? null,
      clientName: a.crm_payments?.clients?.display_name ?? null,
      amountCents: a.amount_cents,
      error: a.qbo_sync_error,
      attemptedAt: a.qbo_sync_attempted_at,
    })),
  });
}
