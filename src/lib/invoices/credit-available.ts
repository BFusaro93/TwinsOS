import { logger } from "@/lib/logger";

const log = logger.child("invoice credit available");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface InvoiceCreditAvailable {
  /** Unapplied credit the client (or its parent account) holds, plus any
   *  deposit reserved for this invoice's estimate. Shown, never subtracted. */
  creditAvailableCents: number;
  /** The balance is fully covered by that credit (oldest-due invoices first,
   *  so one credit never counts as covering several invoices). */
  covered: boolean;
}

/**
 * crm_invoice_credit_available for a batch of invoices. Staff sessions see
 * their own org's invoices; pass a service-role client for the public pay
 * page, the portal and the crons. A failure is logged and treated as "no
 * credit" — it only ever hides a hint or keeps a reminder that would have
 * gone out anyway.
 */
export async function fetchInvoiceCreditAvailable(db: Db, invoiceIds: string[]): Promise<Map<string, InvoiceCreditAvailable>> {
  const out = new Map<string, InvoiceCreditAvailable>();
  const ids = [...new Set(invoiceIds.filter(Boolean))];
  if (ids.length === 0) return out;
  // Chunked: the ids travel in the RPC body, but keep each call bounded.
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await db.rpc("crm_invoice_credit_available", { p_invoice_ids: ids.slice(i, i + 500) });
    if (error) {
      log.error("credit available lookup failed", { error: error.message, count: ids.length });
      return out;
    }
    for (const row of (data ?? []) as { invoice_id: string; credit_available_cents: number | null; covered: boolean | null }[]) {
      out.set(row.invoice_id, { creditAvailableCents: row.credit_available_cents ?? 0, covered: !!row.covered });
    }
  }
  return out;
}

export async function fetchInvoiceCreditAvailableCents(db: Db, invoiceId: string): Promise<number> {
  return (await fetchInvoiceCreditAvailable(db, [invoiceId])).get(invoiceId)?.creditAvailableCents ?? 0;
}
