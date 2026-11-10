/**
 * Browser-side nudge after a staff change that can make a customer's open pay
 * form stale (payment recorded by hand, invoice voided or deleted). The
 * database already queued the intent; this just asks the server to cancel it
 * at Stripe now rather than at the next 5-minute sweep. Fire-and-forget: a
 * failure only means the sweep does it.
 */
export function fireStaleIntentCancel(): void {
  fetch("/api/crm/payments/cancel-stale-intents", { method: "POST" }).catch(() => {});
}
