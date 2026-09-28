import type Stripe from "stripe";
import { decodeAllocations } from "@/lib/stripe/crm-payments";
import { getOrCreateStripeCustomer } from "@/lib/stripe/saved-payment-methods";
import { logger } from "@/lib/logger";

const log = logger.child("stripe duplicate charge");

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

export interface InFlightMarkerLookup {
  stripe: Stripe;
  connectedAccountId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  /** The invoice(s) about to be charged. */
  invoiceIds: string[];
}

/**
 * Returns a still-live PaymentIntent recorded in any of these invoices'
 * `pending_payment_intent_id` marker, or null.
 *
 * findDuplicateChargeIntent() can only list intents by CUSTOMER, and the
 * browser-confirmed routes (public pay link, portal, staff create-intent) used
 * to create intents with no customer at all — so an ACH debit started from the
 * portal was invisible to it, and staff could debit the same invoice again
 * from the "ACH To Charge" queue while the first debit was still settling.
 *
 * The marker is written for EVERY path (synchronously by the autopay routes,
 * and by the Connect webhook's payment_intent.processing handler for
 * browser-confirmed intents), so it is the customer-independent signal. It is
 * only a pointer, though: the intent's live status at Stripe decides. A marker
 * for an intent that has since died, or succeeded AND been recorded, does not
 * block (and is a leftover of a missed clear).
 *
 * Throws if Stripe can't be asked — callers must fail CLOSED on that for a
 * marked invoice: a double debit is worse than asking the user to retry.
 */
export async function findInFlightMarkedIntent({
  stripe,
  connectedAccountId,
  db,
  invoiceIds,
}: InFlightMarkerLookup): Promise<Stripe.PaymentIntent | null> {
  if (invoiceIds.length === 0) return null;
  // pending_payment_* aren't in the generated Supabase types yet.
  const { data: rows, error } = await db
    .from("crm_invoices")
    .select("id, pending_payment_intent_id")
    .in("id", invoiceIds)
    .not("pending_payment_intent_id", "is", null);
  if (error) throw error;

  const intentIds = [
    ...new Set(
      ((rows ?? []) as { pending_payment_intent_id: string | null }[])
        .map((r) => r.pending_payment_intent_id)
        .filter((v): v is string => Boolean(v))
    ),
  ];

  for (const intentId of intentIds) {
    const pi = await stripe.paymentIntents.retrieve(intentId, undefined, { stripeAccount: connectedAccountId });
    if (!BLOCKING_PAYMENT_INTENT_STATUSES.has(pi.status)) continue;
    if (pi.status === "succeeded") {
      // Succeeded and already in the ledger → the balance we're about to
      // charge already reflects it; the marker is just stale.
      const { data: recorded } = await db
        .from("crm_payments")
        .select("id")
        .eq("stripe_payment_intent_id", pi.id)
        .maybeSingle();
      if (recorded) continue;
    }
    return pi;
  }
  return null;
}

/** Shared refusal for a create/charge route that found an in-flight intent. */
export function inFlightChargeMessage(duplicate: Stripe.PaymentIntent, plural = false): string {
  if (duplicate.status === "succeeded") {
    return plural
      ? "A payment covering one or more of these invoices just went through and is still being recorded. Refresh in a moment before charging again."
      : "A payment for this invoice just went through and is still being recorded. Refresh in a moment before charging again.";
  }
  return duplicateChargeMessage(duplicate, plural);
}

export interface ChargeRefusal {
  body: { error: string; code: "duplicate_charge" | "in_flight_check_failed"; inFlight: boolean };
  status: number;
}

/**
 * The one guard every create-intent / charge route runs before creating a
 * PaymentIntent for an invoice (or several):
 *
 *  1. the invoices' own in-flight marker, verified live at Stripe — works for
 *     every path, with or without a Stripe customer. Fails CLOSED if Stripe
 *     can't be asked (503): an ACH double debit is worse than a retry.
 *  2. when a customer is known, the recent-intents lookup by customer
 *     (findDuplicateChargeIntent) — catches an in-flight intent whose marker
 *     never got written. Fails OPEN, as it always has.
 *
 * Returns null when it's safe to charge.
 */
export async function refuseIfChargeInFlight(args: {
  stripe: Stripe;
  connectedAccountId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  invoiceIds: string[];
  customerId: string | null;
  isAch: boolean;
  plural?: boolean;
}): Promise<ChargeRefusal | null> {
  const { stripe, connectedAccountId, db, invoiceIds, customerId, isAch, plural = false } = args;

  try {
    const marked = await findInFlightMarkedIntent({ stripe, connectedAccountId, db, invoiceIds });
    if (marked) {
      return {
        body: { error: inFlightChargeMessage(marked, plural), code: "duplicate_charge", inFlight: marked.status === "processing" },
        status: 409,
      };
    }
  } catch (err) {
    log.error("failed to verify an invoice's in-flight payment marker", { error: err, invoiceIds });
    return {
      body: {
        error: "Couldn't confirm whether a payment for this invoice is already in progress. Please try again in a moment.",
        code: "in_flight_check_failed",
        inFlight: false,
      },
      status: 503,
    };
  }

  if (customerId) {
    try {
      const duplicate = await findDuplicateChargeIntent({ stripe, connectedAccountId, customerId, invoiceIds, isAch });
      if (duplicate) {
        return {
          body: { error: duplicateChargeMessage(duplicate, plural), code: "duplicate_charge", inFlight: duplicate.status === "processing" },
          status: 409,
        };
      }
    } catch (err) {
      // Fail open on the lookup itself (a Stripe API hiccup shouldn't block a
      // legitimate charge) — the idempotency key still catches an
      // exact-duplicate retry, and the marker check above already ran.
      log.error("failed to check for a recent duplicate charge", { error: err, invoiceIds });
    }
  }

  return null;
}

/**
 * The client's Stripe Customer on the connected account, creating (and
 * saving) one if needed, so every CRM invoice PaymentIntent carries a
 * `customer` and is visible to findDuplicateChargeIntent(). Best-effort:
 * returns null on any failure — the marker check doesn't depend on it.
 */
export async function ensureIntentCustomer(args: {
  stripe: Stripe;
  connectedAccountId: string;
  /** Service-role client (writes clients.stripe_customer_id). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceDb: any;
  orgId: string;
  clientId: string;
}): Promise<string | null> {
  const { stripe, connectedAccountId, serviceDb, orgId, clientId } = args;
  try {
    const { data: client, error } = await serviceDb
      .from("clients")
      .select("id, display_name, primary_email, stripe_customer_id")
      .eq("id", clientId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error || !client) return null;
    const customerId = await getOrCreateStripeCustomer(stripe, connectedAccountId, client.stripe_customer_id, client);
    if (customerId !== client.stripe_customer_id) {
      const { error: saveErr } = await serviceDb.from("clients").update({ stripe_customer_id: customerId }).eq("id", clientId);
      if (saveErr) log.error("failed to save stripe customer id", { error: saveErr, clientId });
    }
    return customerId;
  } catch (err) {
    log.error("failed to resolve a stripe customer for a payment intent", { error: err, clientId });
    return null;
  }
}
