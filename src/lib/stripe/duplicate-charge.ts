import type Stripe from "stripe";
import { decodeAllocations } from "@/lib/stripe/crm-payments";

/** How far back to look for an already-in-flight/succeeded PaymentIntent
 * covering the same invoice.
 *
 * A card charge reaches a terminal status within seconds, so a short window is
 * enough to collapse a genuine double-submit (two staff, or one staff in two
 * tabs) that slipped past the 10-second idempotency-key bucket.
 *
 * ACH is the opposite. The debit confirms as `processing` and only settles
 * days later, and nothing is written to the ledger until it does — so the
 * invoice keeps its full balance and keeps appearing in the "ACH To Charge"
 * queue for the whole settlement period. Someone working that queue again the
 * next day, or hitting "Charge All", would debit the client a second time for
 * the same invoice with a 2-minute guard long expired. The ACH window has to
 * outlast settlement instead. */
const RECENT_CHARGE_WINDOW_SECONDS = 120;
const RECENT_ACH_CHARGE_WINDOW_SECONDS = 10 * 24 * 60 * 60; // 10 days

/** Statuses that mean "real money that might still land", as opposed to a dead
 * end (`canceled`, `requires_payment_method` after a decline) that staff are
 * free to retry past. */
const BLOCKING_PAYMENT_INTENT_STATUSES = new Set<Stripe.PaymentIntent.Status>([
  "succeeded",
  "processing",
  "requires_capture",
  "requires_action",
  "requires_confirmation",
]);

/** Which invoices a prior CRM PaymentIntent covers, whichever route created it.
 *
 * Both metadata shapes are read deliberately: a single-invoice charge records
 * `invoice_id`, a combined one records an encoded `allocations` list, and each
 * route used to recognise only its own. That left a real gap in both
 * directions — charging invoice #12 on its own and then including #12 in a
 * combined charge (or the reverse) passed every duplicate check and took the
 * client's money twice. */
function invoicesCoveredBy(pi: Stripe.PaymentIntent): string[] {
  const source = pi.metadata?.source;
  if (source === "crm_invoice" && pi.metadata?.invoice_id) return [pi.metadata.invoice_id];
  if (source === "crm_invoice_multi" && pi.metadata?.allocations) {
    try {
      return decodeAllocations(pi.metadata.allocations).map((a) => a.invoiceId);
    } catch {
      return [];
    }
  }
  return [];
}

export interface DuplicateChargeLookup {
  stripe: Stripe;
  connectedAccountId: string;
  customerId: string;
  /** The invoice(s) about to be charged. */
  invoiceIds: string[];
  /** ACH debits stay in flight for days and need the longer window. */
  isAch: boolean;
}

/** Returns a still-live PaymentIntent already covering any of `invoiceIds`, or
 * null. Throws only if the Stripe lookup itself fails — callers fail open on
 * that, since an API hiccup shouldn't block a legitimate charge and the
 * idempotency key still catches an exact-duplicate retry. */
export async function findDuplicateChargeIntent({
  stripe,
  connectedAccountId,
  customerId,
  invoiceIds,
  isAch,
}: DuplicateChargeLookup): Promise<Stripe.PaymentIntent | null> {
  const recentIntents = await stripe.paymentIntents.list(
    {
      customer: customerId,
      created: {
        gte:
          Math.floor(Date.now() / 1000) -
          (isAch ? RECENT_ACH_CHARGE_WINDOW_SECONDS : RECENT_CHARGE_WINDOW_SECONDS),
      },
      // The ACH window spans days rather than seconds, so a client with a lot
      // of activity needs more than one page of 20 for the intent we're
      // looking for to still be in the result.
      limit: isAch ? 100 : 20,
    },
    { stripeAccount: connectedAccountId }
  );

  const targets = new Set(invoiceIds);
  return (
    recentIntents.data.find(
      (pi) =>
        BLOCKING_PAYMENT_INTENT_STATUSES.has(pi.status) &&
        invoicesCoveredBy(pi).some((id) => targets.has(id))
    ) ?? null
  );
}

/** The message to hand staff for a blocked duplicate. An in-flight bank debit
 * needs different wording from a card: "wait a moment" is wrong for something
 * that takes days, and the invoice legitimately stays in the queue meanwhile. */
export function duplicateChargeMessage(duplicate: Stripe.PaymentIntent, plural = false): string {
  if (duplicate.status === "processing") {
    return plural
      ? "A bank debit covering one or more of these invoices is already in progress and hasn't settled yet. They stay in this queue until it does — charging again would debit the client twice."
      : "A bank debit for this invoice is already in progress and hasn't settled yet. It stays in this queue until it does — charging again would debit the client twice.";
  }
  return plural
    ? "A charge was already just submitted for one or more of these invoices. Please wait a moment or check Payment History before retrying."
    : "A charge was already just submitted for this invoice. Please wait a moment or check Payment History before retrying.";
}
