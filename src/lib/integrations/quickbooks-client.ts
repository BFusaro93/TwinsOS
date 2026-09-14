/**
 * Fire-and-forget QuickBooks push triggers, callable from client-side
 * mutation hooks — mirrors fireAutomationTrigger. Never awaited by
 * callers; a failure here must never surface as a failure of the invoice
 * send / payment record action it's attached to.
 */
export function fireQuickBooksInvoiceSync(invoiceId: string): void {
  fetch(`/api/crm/invoices/${invoiceId}/quickbooks-sync`, { method: "POST" }).catch(() => {});
}

export function fireQuickBooksPaymentSync(paymentId: string): void {
  fetch(`/api/crm/payments/${paymentId}/quickbooks-sync`, { method: "POST" }).catch(() => {});
}
