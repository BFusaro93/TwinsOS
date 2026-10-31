import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushPaymentToQuickBooks, snapshotQuickBooksPaymentLinks, mirrorPaymentReversalToQuickBooks } from "@/lib/integrations/quickbooks";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

/**
 * POST /api/crm/payments/[id]/quickbooks-sync — pushes this payment's
 * invoice allocations to QuickBooks, one QBO Payment per allocation.
 * Called automatically when a payment is recorded, and can be called
 * again as a manual retry — idempotent per allocation. A retry also re-runs
 * the refund/chargeback reconciliation for allocations already in QuickBooks,
 * so a refund whose QuickBooks update failed can be fixed from Sync Status.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const effOrgId = (await getEffectiveOrgId(supabase)) ?? profile.org_id;

  // Also auto-fired after a payment is recorded, so accept the payment keys too.
  if (!(await hasAnySettingsPermission(supabase, ["quickbooks_resync", "acct_add_modify_payments"]))) {
    return NextResponse.json({ error: "You don't have permission to sync payments to QuickBooks" }, { status: 403 });
  }

  const { id } = await params;
  const result = await pushPaymentToQuickBooks(supabase, effOrgId, id);
  // Only when something is already flagged, so a brand-new payment doesn't pay for extra QuickBooks lookups.
  const { count: flagged } = await supabase
    .from("crm_payment_allocations")
    .select("id", { count: "exact", head: true })
    .eq("payment_id", id)
    .not("qbo_payment_id", "is", null)
    .not("qbo_sync_error", "is", null);
  if (!flagged) return NextResponse.json(result);
  const links = await snapshotQuickBooksPaymentLinks(supabase, id);
  const reconciled = await mirrorPaymentReversalToQuickBooks(supabase, effOrgId, id, links);
  if (reconciled.failed === 0 && reconciled.ok > 0) {
    return NextResponse.json({ ...result, pushedAllocations: (result.pushedAllocations ?? 0) + reconciled.ok });
  }
  return NextResponse.json(result);
}
