import type { InvoiceStatus } from "@/types/crm-invoices";

interface OverdueCheckFields {
  balanceCents: number;
  dueDate: string | null;
  invoiceDate: string;
  terms: string | null;
}

/** No cron/automation ever flips the stored `status` column to "overdue" —
 *  it's purely a point-in-time computation over balance/due date. Shared so
 *  every view (list, detail) agrees on what counts as overdue instead of
 *  reimplementing this comparison separately. */
export function isInvoiceOverdue(invoice: OverdueCheckFields): boolean {
  if (invoice.balanceCents <= 0) return false;
  const effectiveDue = invoice.dueDate ?? (invoice.terms === "due_on_receipt" ? invoice.invoiceDate : null);
  if (!effectiveDue) return false;
  return new Date(effectiveDue + "T23:59:59") < new Date();
}

/** The status to actually display — overrides a stale "sent"/"printed"/etc.
 *  with "overdue" once the invoice qualifies, without touching the stored
 *  value (paid/void/draft are left alone since they're never overdue). */
export function getDisplayInvoiceStatus(
  invoice: OverdueCheckFields & { status: InvoiceStatus }
): InvoiceStatus {
  if (invoice.status === "paid" || invoice.status === "void" || invoice.status === "draft") {
    return invoice.status;
  }
  return isInvoiceOverdue(invoice) ? "overdue" : invoice.status;
}

/** Pill colors for a (display) invoice status — same palette as the
 *  Invoices list and detail sheet. */
export const INVOICE_STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft:   "bg-slate-100 text-slate-600",
  printed: "bg-indigo-100 text-indigo-700",
  sent:    "bg-blue-100 text-blue-700",
  viewed:  "bg-purple-100 text-purple-700",
  partial: "bg-yellow-100 text-yellow-700",
  paid:    "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-600",
  void:    "bg-slate-200 text-slate-500",
};
