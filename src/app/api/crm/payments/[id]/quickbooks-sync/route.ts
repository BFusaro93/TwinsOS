import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncPaymentToQuickBooks } from "@/lib/integrations/quickbooks";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

/**
 * POST /api/crm/payments/[id]/quickbooks-sync — brings this payment's
 * QuickBooks side in line with Landscapt: pushes allocations not in QuickBooks
 * yet (one QBO Payment per allocation), updates the ones already there whose
 * amount, date or reference changed (an edited payment, a lowered invoice
 * total, a refund or chargeback), and voids the ones whose allocation is gone
 * (an edit that moved the payment to another invoice). Called automatically
 * when a payment is recorded or edited and when credit is applied, and again
 * as a manual retry from Sync Status — idempotent.
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

  // Also auto-fired after a payment or credit is recorded or edited, so accept those keys too.
  if (!(await hasAnySettingsPermission(supabase, ["quickbooks_resync", "acct_add_modify_payments", "acct_add_modify_credits"]))) {
    return NextResponse.json({ error: "You don't have permission to sync payments to QuickBooks" }, { status: 403 });
  }

  const { id } = await params;
  const result = await syncPaymentToQuickBooks(supabase, effOrgId, id);
  return NextResponse.json(result);
}
