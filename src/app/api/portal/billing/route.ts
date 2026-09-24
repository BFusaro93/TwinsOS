import { NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();

  // crm_invoices has no paid_at column — selecting it made PostgREST 400 and,
  // because the error was discarded, the portal's billing page silently showed
  // no invoices at all. Payment state is carried by status/balance_cents, and
  // nothing downstream consumed paid_at.
  const { data: invoices, error } = await supabase
    .from("crm_invoices")
    .select("id, invoice_number, total_cents, balance_cents, due_date, status, created_at")
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    // Drafts are unfinished staff work — never shown to the customer.
    .neq("status", "draft")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 });
  }

  return NextResponse.json({ invoices: invoices ?? [] });
}
