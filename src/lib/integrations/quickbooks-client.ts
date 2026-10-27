/**
 * Fire-and-forget QuickBooks push triggers, callable from client-side
 * mutation hooks — mirrors fireAutomationTrigger. Never awaited by
 * callers; a failure here must never surface as a failure of the invoice
 * send / payment record action it's attached to.
 */
export function fireQuickBooksInvoiceSync(invoiceId: string): void {
  fetch(`/api/crm/invoices/${invoiceId}/quickbooks-sync`, { method: "POST" }).catch(() => {});
}

const pendingInvoiceUpdates = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Pushes a change to an invoice that is ALREADY in QuickBooks (amounts, lines,
 * terms, or a void). A draft that was never pushed is left alone server-side.
 * Debounced per invoice: Save fires the totals and header mutations together,
 * and two simultaneous QuickBooks writes would race on the invoice's SyncToken.
 */
export function fireQuickBooksInvoiceUpdate(invoiceId: string): void {
  const pending = pendingInvoiceUpdates.get(invoiceId);
  if (pending) clearTimeout(pending);
  pendingInvoiceUpdates.set(
    invoiceId,
    setTimeout(() => {
      pendingInvoiceUpdates.delete(invoiceId);
      fetch(`/api/crm/invoices/${invoiceId}/quickbooks-sync?onlyIfSynced=1`, { method: "POST" }).catch(() => {});
    }, 1500)
  );
}

export function fireQuickBooksPaymentSync(paymentId: string): void {
  fetch(`/api/crm/payments/${paymentId}/quickbooks-sync`, { method: "POST" }).catch(() => {});
}
