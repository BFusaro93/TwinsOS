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
