import type { AccountStatementActivityRow } from "@/components/crm/invoices/pdf/AccountStatementDocument";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface AccountStatementData {
  accountNumber: string | null;
  /** Every open/closed invoice and payment/credit dated before `fromDate`,
   *  collapsed into a single running total — same "Balance Forward" concept
   *  as the paper statement format this mirrors. */
  balanceForwardCents: number;
  rows: AccountStatementActivityRow[];
  endingBalanceCents: number;
  lastPayment: { amountCents: number; date: string; reference: string | null } | null;
}

/** Reconstructs a client's account activity as a dated, running-balance
 *  ledger for the statement PDF — merges invoices (charges) and
 *  payments/credits (reductions) sorted by date, the same way the org's
 *  paper statements already present activity. Only invoices/payments up to
 *  `toDate` are considered; the running balance as of `toDate` is what a
 *  mailed statement would show. */
export async function buildAccountStatementData(
  supabase: AnyClient,
  params: { clientId: string; orgId: string; fromDate: string; toDate: string }
): Promise<AccountStatementData> {
  const { clientId, fromDate, toDate } = params;

  const { data: invoiceRows } = await supabase
    .from("crm_invoices")
    .select("id, invoice_number, invoice_date, description, total_cents")
    .eq("client_id", clientId)
    .neq("status", "void")
    .neq("status", "draft")
    .is("deleted_at", null)
    .lte("invoice_date", toDate)
    .order("invoice_date", { ascending: true });

  const { data: paymentRows } = await supabase
    .from("crm_payments")
    .select("id, payment_date, amount_cents, method, reference, is_credit, invoice_id, crm_invoices(invoice_number)")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .lte("payment_date", toDate)
    .order("payment_date", { ascending: true });

  type LedgerEntry = {
    date: string;
    kind: "invoice" | "payment" | "credit";
    label: string;
    invoiceNumber: number | null;
    amountCents: number; // signed: +charge, -payment/credit
  };

  const entries: LedgerEntry[] = [
    ...(invoiceRows ?? []).map((r: Record<string, unknown>): LedgerEntry => ({
      date: r.invoice_date as string,
      kind: "invoice",
      label: `Invoice #${r.invoice_number}${r.description ? ` — ${r.description}` : ""}`,
      invoiceNumber: r.invoice_number as number,
      amountCents: (r.total_cents as number) ?? 0,
    })),
    ...(paymentRows ?? []).map((r: Record<string, unknown>): LedgerEntry => {
      const invoiceNumber =
        (r.crm_invoices as { invoice_number?: number } | null)?.invoice_number ?? null;
      const isCredit = r.is_credit === true;
      return {
        date: r.payment_date as string,
        kind: isCredit ? "credit" : "payment",
        label: isCredit
          ? `Credit${r.reference ? ` (Ref #: ${r.reference})` : ""}`
          : `Payment — ${r.method}${invoiceNumber ? ` (Invoice #${invoiceNumber})` : ""}${r.reference ? ` (Ref #: ${r.reference})` : ""}`,
        invoiceNumber,
        amountCents: -((r.amount_cents as number) ?? 0),
      };
    }),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  let balanceForwardCents = 0;
  const rows: AccountStatementActivityRow[] = [];

  for (const e of entries) {
    running += e.amountCents;
    if (e.date < fromDate) {
      balanceForwardCents = running;
      continue;
    }
    rows.push({
      date: e.date,
      kind: e.kind,
      label: e.label,
      invoiceNumber: e.invoiceNumber,
      amountCents: e.amountCents,
      balanceCents: running,
    });
  }

  const lastPaymentRow = [...(paymentRows ?? [])]
    .filter((r: Record<string, unknown>) => r.is_credit !== true)
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      (b.payment_date as string).localeCompare(a.payment_date as string)
    )[0];

  const { data: clientRow } = await supabase
    .from("clients")
    .select("account_number")
    .eq("id", clientId)
    .maybeSingle();

  return {
    accountNumber: (clientRow?.account_number as string | null) ?? null,
    balanceForwardCents,
    rows,
    endingBalanceCents: running,
    lastPayment: lastPaymentRow
      ? {
          amountCents: (lastPaymentRow.amount_cents as number) ?? 0,
          date: lastPaymentRow.payment_date as string,
          reference: (lastPaymentRow.reference as string | null) ?? null,
        }
      : null,
  };
}
