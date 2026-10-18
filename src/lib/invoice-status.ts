import type { InvoiceStatus } from "@/types/crm-invoices";
import { DEFAULT_TIME_ZONE, todayInZone } from "@/lib/time/zone";

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
export function isInvoiceOverdue(
  invoice: OverdueCheckFields,
  // The org's calendar day (YYYY-MM-DD). Defaults to the platform's operating zone
  // rather than the VIEWER's clock: comparing against `new Date()` in the browser
  // made an invoice flip to overdue hours early or late for anyone outside the
  // org's zone, and disagree with the reports (which use the org's day).
  todayYmd: string = todayInZone(DEFAULT_TIME_ZONE)
): boolean {
  if (invoice.balanceCents <= 0) return false;
  const effectiveDue = invoice.dueDate ?? (invoice.terms === "due_on_receipt" ? invoice.invoiceDate : null);
  if (!effectiveDue) return false;
  // Overdue once the due DAY has fully passed.
  return effectiveDue.slice(0, 10) < todayYmd;
}

/** The status to actually display — overrides a stale "sent"/"printed"/etc.
 *  with "overdue" once the invoice qualifies, without touching the stored
 *  value (paid/void/draft are left alone since they're never overdue). */
export function getDisplayInvoiceStatus(
  invoice: OverdueCheckFields & { status: InvoiceStatus },
  todayYmd?: string
): InvoiceStatus {
  if (invoice.status === "paid" || invoice.status === "void" || invoice.status === "draft") {
    return invoice.status;
  }
  return isInvoiceOverdue(invoice, todayYmd) ? "overdue" : invoice.status;
}

/** Pill colors for a (display) invoice status — same palette as the
 *  Invoices list and detail sheet. */
export const INVOICE_STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft:   "bg-muted text-slate-600 dark:text-neutral-400",
  printed: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400",
  sent:    "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
  viewed:  "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400",
  partial: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400",
  paid:    "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  overdue: "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
  void:    "bg-slate-200 dark:bg-neutral-700 text-muted-foreground",
};
