import type { InvoicePDFStatementData } from "@/components/crm/invoices/pdf/InvoiceDocument";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** Builds the account-activity context (previous balance, last payment,
 *  prior invoice) the "statement" PDF layout needs beyond one invoice's own
 *  fields. Only called when that layout is actually selected — every other
 *  layout ignores this data entirely. */
export async function buildInvoiceStatementData(
  supabase: AnyClient,
  inv: {
    id: string;
    client_id: string | null;
    org_id: string;
    total_cents: number | null;
    balance_cents: number | null;
    invoice_date: string | null;
  }
): Promise<InvoicePDFStatementData | null> {
  if (!inv.client_id) return null;

  // Excludes drafts (the customer hasn't received them) and anything dated
  // after this invoice (a statement can't owe the customer for something
  // that hasn't happened from their perspective yet).
  const { data: otherInvoices } = await supabase
    .from("crm_invoices")
    .select("invoice_number, invoice_date, due_date, balance_cents, total_cents")
    .eq("client_id", inv.client_id)
    .neq("id", inv.id)
    .neq("status", "void")
    .neq("status", "draft")
    .is("deleted_at", null)
    .lte("invoice_date", inv.invoice_date ?? new Date().toISOString().slice(0, 10))
    .order("invoice_date", { ascending: false });

  const previousBalanceCents = (otherInvoices ?? []).reduce(
    (sum: number, row: { balance_cents: number | null }) => sum + (row.balance_cents ?? 0),
    0
  );

  // "Prior invoice" should be the most recent OTHER invoice that still has
  // an outstanding balance — the plain newest-by-date row could be one this
  // invoice already indirectly follows-up on but that's since been paid in
  // full, which would otherwise print as still owed and "N days past due".
  const priorInvoiceRow =
    (otherInvoices ?? []).find(
      (row: { balance_cents: number | null }) => (row.balance_cents ?? 0) > 0
    ) ?? null;
  const priorInvoice = priorInvoiceRow
    ? {
        invoiceNumber: priorInvoiceRow.invoice_number as number,
        amountCents: (priorInvoiceRow.balance_cents as number) ?? 0,
        date: priorInvoiceRow.invoice_date as string,
        daysPastDue: priorInvoiceRow.due_date
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(priorInvoiceRow.due_date + "T12:00:00").getTime()) / 86_400_000
              )
            )
          : 0,
      }
    : null;

  const { data: paymentRow } = await supabase
    .from("crm_payments")
    .select("amount_cents, payment_date, reference")
    .eq("client_id", inv.client_id)
    .is("deleted_at", null)
    .order("payment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastPayment = paymentRow
    ? {
        amountCents: paymentRow.amount_cents as number,
        date: paymentRow.payment_date as string,
        reference: (paymentRow.reference as string | null) ?? null,
      }
    : null;

  const { data: clientRow } = await supabase
    .from("clients")
    .select("account_number")
    .eq("id", inv.client_id)
    .maybeSingle();

  return {
    accountNumber: (clientRow?.account_number as string | null) ?? null,
    previousBalanceCents,
    // The running total is every OTHER invoice's outstanding balance plus
    // THIS invoice's own outstanding balance — not its total. Using
    // total_cents overstated the balance by however much of this invoice
    // had already been paid/credited.
    accountBalanceCents: previousBalanceCents + (inv.balance_cents ?? 0),
    lastPayment,
    priorInvoice,
  };
}
