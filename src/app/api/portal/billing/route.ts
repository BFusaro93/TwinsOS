import { NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("crm_invoices")
    .select("id, invoice_number, total_cents, balance_cents, due_date, status, created_at, paid_at")
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ invoices: invoices ?? [] });
}
