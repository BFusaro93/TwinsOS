import { NextResponse } from "next/server";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { createClient } from "@/lib/supabase/server";
import { pushInvoiceToQuickBooks } from "@/lib/integrations/quickbooks";

/**
 * POST /api/crm/invoices/[id]/quickbooks-sync — pushes this invoice to
 * QuickBooks: creates it, or — if it already has a qbo_invoice_id — updates
 * it to match Landscapt (or voids it there when it's void here). Called
 * automatically when an invoice is sent and whenever a synced invoice is
 * edited or voided (fire-and-forget), and as a manual retry. With
 * ?onlyIfSynced=1 an invoice that was never pushed is left alone, so editing a
 * draft can't create it in QuickBooks early.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const onlyIfSynced = new URL(req.url).searchParams.get("onlyIfSynced") === "1";
  const result = await pushInvoiceToQuickBooks(supabase, profile.org_id, id, { onlyIfSynced });
  return NextResponse.json(result);
}
