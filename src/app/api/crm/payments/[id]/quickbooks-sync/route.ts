import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushPaymentToQuickBooks } from "@/lib/integrations/quickbooks";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";

/**
 * POST /api/crm/payments/[id]/quickbooks-sync — pushes this payment's
 * invoice allocations to QuickBooks, one QBO Payment per allocation.
 * Called automatically when a payment is recorded, and can be called
 * again as a manual retry — idempotent per allocation.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Also auto-fired after a payment is recorded, so accept the payment keys too.
  if (!(await hasAnySettingsPermission(supabase, ["quickbooks_resync", "acct_add_modify_payments"]))) {
    return NextResponse.json({ error: "You don't have permission to sync payments to QuickBooks" }, { status: 403 });
  }

  const { id } = await params;
  const result = await pushPaymentToQuickBooks(supabase, profile.org_id, id);
  return NextResponse.json(result);
}
