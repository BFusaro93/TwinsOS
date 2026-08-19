import { NextResponse } from "next/server";
import { adminClient, authenticateZapierRequest } from "@/lib/integrations/zapier";

/**
 * GET /api/integrations/zapier/triggers/invoices-paid — Zapier polling
 * trigger ("Invoice Paid"). Returns the most recently fully-paid invoices
 * (balance_cents = 0), newest first by invoice_date.
 */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const { data, error } = await db
    .from("crm_invoices")
    .select("id, invoice_number, client_id, invoice_date, due_date, status, amount_paid_cents, balance_cents, created_at")
    .eq("org_id", auth.orgId)
    .eq("status", "paid")
    .is("deleted_at", null)
    .order("invoice_date", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const invoices = (data ?? []).map((i) => ({
    id: i.id,
    invoiceNumber: i.invoice_number,
    clientId: i.client_id,
    invoiceDate: i.invoice_date,
    dueDate: i.due_date,
    status: i.status,
    amountPaidCents: i.amount_paid_cents,
    balanceCents: i.balance_cents,
    createdAt: i.created_at,
  }));

  return NextResponse.json(invoices);
}
