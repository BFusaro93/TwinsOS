/**
 * Payment-terms -> due-date helpers for server-side invoice creators
 * (auto-invoice on visit completion, contract cron). Mirrors TERMS_OPTIONS in
 * InvoiceDetail.tsx. Without a due_date the invoice-past-due cron never fires.
 */
const TERMS_DAYS: Record<string, number> = {
  due_on_receipt: 0,
  net_10: 10,
  net_15: 15,
  net_30: 30,
  net_45: 45,
  net_60: 60,
  net_90: 90,
};

/** Resolve terms: client default, else org default, else due_on_receipt. */
export function resolveInvoiceTerms(
  clientTerms: string | null | undefined,
  orgDefaultTerms: string | null | undefined,
): string {
  if (clientTerms && clientTerms in TERMS_DAYS) return clientTerms;
  if (orgDefaultTerms && orgDefaultTerms in TERMS_DAYS) return orgDefaultTerms;
  return "due_on_receipt";
}

/** invoiceDate is YYYY-MM-DD; returns YYYY-MM-DD plus the terms' day count. */
export function computeDueDate(invoiceDate: string, terms: string): string {
  const days = TERMS_DAYS[terms] ?? 0;
  const [y, m, d] = invoiceDate.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
