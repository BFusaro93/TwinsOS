import { NextResponse } from "next/server";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { createClient } from "@/lib/supabase/server";
import { pushInvoiceToQuickBooks } from "@/lib/integrations/quickbooks";

/**
 * POST /api/crm/invoices/[id]/quickbooks-sync — pushes this invoice to
 * QuickBooks. Called automatically whenever an invoice is sent (email send
 * and the manual status dropdown both fire this fire-and-forget), and can
 * be called again as a manual retry — idempotent via qbo_invoice_id.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Also fired automatically after send/record — accept the keys for those
  // actions as well as the explicit resync permission.
  if (!(await hasAnySettingsPermission(supabase, ["quickbooks_resync", "acct_send_invoices", "acct_add_modify_invoices"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const result = await pushInvoiceToQuickBooks(supabase, profile.org_id, id);
  return NextResponse.json(result);
}
