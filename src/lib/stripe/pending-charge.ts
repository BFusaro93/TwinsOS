import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const log = logger.child("stripe pending charge");

/** Statuses that mean a charge is in flight against an invoice but hasn't
 * settled: an ACH debit sits in `processing` for days, and a card can park in
 * `requires_action` waiting on the cardholder. Neither writes to crm_payments
 * (that table only holds settled money), so without a marker the invoice looks
 * untouched — same balance, same place in the "To Charge" queue. */
const PENDING_STATUSES = new Set<Stripe.PaymentIntent.Status>([
  "processing",
  "requires_action",
  "requires_confirmation",
  "requires_capture",
]);

export function isPendingChargeStatus(status: Stripe.PaymentIntent.Status): boolean {
  return PENDING_STATUSES.has(status);
}

/** Human label for the pending marker, so the queue can say "bank debit"
 * rather than leaking Stripe's `us_bank_account`. */
function methodLabel(paymentIntent: Stripe.PaymentIntent): string {
  return paymentIntent.payment_method_types?.includes("us_bank_account") ? "us_bank_account" : "card";
}

export interface MarkPendingChargeArgs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>;
  paymentIntent: Stripe.PaymentIntent;
  /** Amount pending per invoice, in cents. A combined charge splits across
   * several invoices, so each row records only its own share. */
  amountsByInvoiceId: Map<string, number>;
}

/** Flags each invoice as having this PaymentIntent in flight.
 *
 * Best-effort by design: the charge has already been submitted to Stripe by the
 * time this runs, and failing to write a UI marker must never turn a successful
 * submission into an error response. A missed marker degrades to the previous
 * behaviour — the invoice stays in the queue and the server-side duplicate
 * guard refuses the second charge. */
export async function markInvoicesPendingCharge({
  db,
  paymentIntent,
  amountsByInvoiceId,
}: MarkPendingChargeArgs): Promise<void> {
  const method = methodLabel(paymentIntent);
  const at = new Date().toISOString();

  for (const [invoiceId, amountCents] of amountsByInvoiceId) {
    // pending_payment_* aren't in the generated Supabase types yet (added by
    // 20260908120000, types not regenerated — a concurrent session owns that file).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from("crm_invoices") as any)
      .update({
        pending_payment_intent_id: paymentIntent.id,
        pending_payment_cents: amountCents,
        pending_payment_method: method,
        pending_payment_at: at,
      })
      .eq("id", invoiceId);
    if (error) {
      log.error("failed to mark invoice as having a payment in flight", {
        error,
        invoiceId,
        paymentIntentId: paymentIntent.id,
      });
    }
  }
}

/** Clears the marker for a PaymentIntent that has settled or failed.
 *
 * Matched on the intent id rather than the invoice, which makes it idempotent,
 * covers single and combined charges with one call, and — importantly — cannot
 * clobber a newer marker belonging to a different intent. */
export async function clearPendingCharge(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  paymentIntentId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from("crm_invoices") as any)
    .update({
      pending_payment_intent_id: null,
      pending_payment_cents: null,
      pending_payment_method: null,
      pending_payment_at: null,
    })
    .eq("pending_payment_intent_id", paymentIntentId);
  if (error) {
    log.error("failed to clear the payment-in-flight marker", { error, paymentIntentId });
  }
}
