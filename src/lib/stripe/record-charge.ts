import type Stripe from "stripe";
import { getStripeForOrg } from "@/lib/stripe/server";
import { methodForPaymentIntent, decodeAllocations } from "@/lib/stripe/crm-payments";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { logger } from "@/lib/logger";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

const log = logger.child("stripe record charge");

/**
 * The single place a succeeded Stripe PaymentIntent becomes a `crm_payments`
 * row + `crm_payment_allocations` + an applied invoice balance.
 *
 * WHY THIS EXISTS: this used to live only inside the Connect webhook
 * (src/app/api/crm/payments/connect-webhook/route.ts). That made the webhook
 * the *only* thing that ever recorded a card payment — so a webhook outage, a
 * rotated/misconfigured signing secret, or a wrong endpoint URL meant the
 * customer's card was charged at Stripe and the business had no record of it
 * at all (the invoice just stayed Overdue). That happened live.
 *
 * Now the routes that confirm a charge off-session and get back a terminal
 * `succeeded` status record it synchronously, and the webhook is an
 * idempotent backstop that no-ops if the synchronous write already landed
 * (and remains the *only* applier for browser-confirmed intents from
 * create-intent / create-intent-multi, and for ACH, which settles days later).
 *
 * IDEMPOTENCY + ATOMICITY: the whole ledger write is one transaction in the
 * record_stripe_invoice_payment() RPC, keyed on the Stripe PaymentIntent id
 * (advisory lock + existence check, with the unique partial index
 * `crm_payments_stripe_payment_intent_id_idx` as the backstop). Both writers
 * call it; the second gets "already_recorded" with no side effects. Because
 * nothing is committed unless everything is, a failed attempt leaves no
 * half-recorded payment for a retry to trip over.
 */
export type RecordStripeChargeResult = "applied" | "already_recorded" | "skipped" | "error";

// any: the generated Supabase types don't cover every table this touches
// (crm_payment_allocations, client_activity) — same pattern as the webhook
// this logic was extracted from.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;
type AnySupabase = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface RecordStripeChargeArgs {
  /** Service-role Supabase client (writes bypass RLS — org scoping is enforced
   * by the connected-account ownership check below, not by the caller's session). */
  db: Db;
  /** Same client, untyped-passthrough for fireSimpleTrigger. */
  supabase: AnySupabase;
  paymentIntent: Stripe.PaymentIntent;
  /** The connected account the charge actually happened on. For the webhook
   * this is `event.account`; for a synchronous charge route it is the account
   * the PaymentIntent was created against. */
  connectedAccountId: string | null | undefined;
}

/** A Standard connected account is a full, independent Stripe account — its
 * owner can call the Stripe API directly and create a PaymentIntent with
 * ARBITRARY metadata (including another org's org_id/invoice_id). Never trust
 * PaymentIntent.metadata.org_id on its own: confirm the account the charge
 * actually happened on is the one on file for that org first. */
export async function accountOwnedByOrg(db: Db, orgId: string, account: string): Promise<boolean> {
  const { data } = await db
    .from("organizations")
    .select("stripe_connect_account_id")
    .eq("id", orgId)
    .single();
  return data?.stripe_connect_account_id === account;
}

/** Which platform key (live/test) to use for further API calls scoped to this
 * org's connected account (e.g. `stripe.charges.list({ stripeAccount: ... })`)
 * — mirrors getStripeForOrg()'s livemode contract. */
async function stripeForOrgConnectedAccount(db: Db, orgId: string): Promise<Stripe> {
  const { data } = await db
    .from("organizations")
    .select("stripe_connect_livemode")
    .eq("id", orgId)
    .single();
  return getStripeForOrg(data?.stripe_connect_livemode ?? null);
}

export async function resolveMethod(
  db: Db,
  orgId: string,
  paymentIntent: Stripe.PaymentIntent,
  connectedAccountId: string
): Promise<{ method: string; isAch: boolean }> {
  const isAch = paymentIntent.payment_method_types.includes("us_bank_account");
  let cardBrand: string | null = null;
  if (!isAch) {
    try {
      // Resolve the client matching this org's livemode rather than whichever
      // key happened to verify a webhook signature — the sandbox org's
      // connected account lives under the test-mode platform key.
      const orgStripe = await stripeForOrgConnectedAccount(db, orgId);
      const charges = await orgStripe.charges.list(
        { payment_intent: paymentIntent.id, limit: 1 },
        { stripeAccount: connectedAccountId }
      );
      cardBrand = charges.data[0]?.payment_method_details?.card?.brand ?? null;
    } catch {
      cardBrand = null;
    }
  }
  return { method: methodForPaymentIntent(paymentIntent.payment_method_types, cardBrand), isAch };
}

/**
 * Records a succeeded PaymentIntent against its invoice(s). Dispatches on
 * `metadata.source`: `crm_invoice` (single) or `crm_invoice_multi` (one charge
 * split across several invoices for the same client).
 *
 * Returns "skipped" for anything that isn't a succeeded CRM invoice intent —
 * notably an ACH intent still in `processing`, which must not be recorded
 * until it actually settles (the webhook records it then).
 */
export async function recordStripeCharge(args: RecordStripeChargeArgs): Promise<RecordStripeChargeResult> {
  const { paymentIntent } = args;

  // ACH confirms as `processing` and only reaches `succeeded` days later, and
  // a card intent can come back `requires_action`. Only a terminal success is
  // real money in the bank — anything else stays the webhook's job.
  if (paymentIntent.status !== "succeeded") return "skipped";

  const source = paymentIntent.metadata?.source;
  if (source === "crm_invoice_multi") return recordMultiInvoiceCharge(args);
  if (source === "crm_invoice") return recordSingleInvoiceCharge(args);
  return "skipped";
}

async function recordSingleInvoiceCharge({
  db,
  supabase,
  paymentIntent,
  connectedAccountId,
}: RecordStripeChargeArgs): Promise<RecordStripeChargeResult> {
  if (!connectedAccountId) {
    log.error("succeeded payment intent with no connected account", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  const { org_id: orgId, invoice_id: invoiceId, client_id: clientId } = paymentIntent.metadata;
  const balanceCents = parseInt(paymentIntent.metadata.balance_cents, 10);
  const feeCents = parseInt(paymentIntent.metadata.fee_cents, 10);

  if (!orgId || !invoiceId || !clientId || !Number.isFinite(balanceCents) || !Number.isFinite(feeCents)) {
    log.error("missing/invalid metadata on payment intent", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  if (!(await accountOwnedByOrg(db, orgId, connectedAccountId))) {
    log.error("payment intent metadata org_id does not own the connected account the charge fired on", {
      paymentIntentId: paymentIntent.id,
      orgId,
      connectedAccountId,
    });
    return "error";
  }

  const { method, isAch } = await resolveMethod(db, orgId, paymentIntent, connectedAccountId);

  // `balanceCents` is the balance the intent was created against, captured at
  // create-intent time — if a second PaymentIntent for the same invoice was
  // created before the first settled (e.g. the customer opened the pay link
  // on two devices), both can genuinely succeed as real charges, each quoting
  // the FULL balance owed at creation time. record_stripe_invoice_payment()
  // clamps to the invoice's live remaining balance under a row lock and
  // credits any excess to the client as unused credit.
  return applyViaRpc({
    db,
    supabase,
    paymentIntent,
    orgId,
    clientId,
    allocations: [{ invoiceId, amountCents: balanceCents }],
    feeCents,
    method,
    isAch,
  });
}

interface ApplyViaRpcArgs {
  db: Db;
  supabase: AnySupabase;
  paymentIntent: Stripe.PaymentIntent;
  orgId: string;
  clientId: string;
  allocations: { invoiceId: string; amountCents: number }[];
  feeCents: number;
  method: string;
  isAch: boolean;
}

/**
 * The ledger write itself: ONE transaction in record_stripe_invoice_payment()
 * (20260927100100). It used to be five separately-committed steps here —
 * unlocked read → clamp → insert payment → apply_payment_to_invoice →
 * insert allocation — and when the last step failed, amount_paid had already
 * risen, the webhook 500'd, and Stripe's retry hit the unique index and
 * returned "already_recorded": the money was lost from the client's credit and
 * the invoice showed paid > total. Now a failure writes nothing, so a retry
 * starts clean; a repeat of an already-recorded intent is a no-op in the DB.
 *
 * The RPC also refuses to apply to draft/void/deleted invoices (their share
 * becomes client credit — a payment never un-voids an invoice) and merges
 * duplicate invoice ids in the split.
 */
async function applyViaRpc({
  db,
  supabase,
  paymentIntent,
  orgId,
  clientId,
  allocations,
  feeCents,
  method,
  isAch,
}: ApplyViaRpcArgs): Promise<RecordStripeChargeResult> {
  const { data, error } = await db.rpc("record_stripe_invoice_payment", {
    p_org_id: orgId,
    p_client_id: clientId,
    p_payment_intent_id: paymentIntent.id,
    p_allocations: allocations.map((a) => ({ invoice_id: a.invoiceId, amount_cents: a.amountCents })),
    p_fee_cents: feeCents,
    p_method: method,
    p_payment_date: todayInZone(await getOrgTimeZone(db, orgId)),
    p_channel_label: isAch ? "bank transfer" : "card",
  });

  if (error) {
    // Unique violation = the other writer (synchronous route vs webhook)
    // committed first despite the advisory lock (e.g. a pre-migration row).
    if (error.code === "23505") return "already_recorded";
    log.error("failed to record stripe payment", { error, paymentIntentId: paymentIntent.id });
    return "error";
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    log.error("record_stripe_invoice_payment returned no row", { paymentIntentId: paymentIntent.id });
    return "error";
  }
  if (row.result === "already_recorded") return "already_recorded";

  const paymentId: string = row.payment_id;
  const unusedCents: number = row.unused_cents ?? 0;
  const amountCents: number = row.amount_cents ?? 0;
  const newlyPaidInvoiceIds: string[] = row.newly_paid_invoice_ids ?? [];

  // Everything below is best-effort follow-up: the money is already
  // recorded atomically, so none of it may turn this into an "error" (that
  // would make the webhook 500 and Stripe retry a no-op forever).
  try {
    for (const invoiceId of newlyPaidInvoiceIds) {
      await fireSimpleTrigger(supabase, { orgId, clientId, invoiceId, triggerType: "invoice_paid" });
    }

    const invoiceCount = new Set(allocations.map((a) => a.invoiceId)).size;
    await db.from("client_activity").insert({
      org_id: orgId,
      client_id: clientId,
      activity_type: "payment",
      subject: `Payment received: ${method} (online)${invoiceCount > 1 ? ` — ${invoiceCount} invoices` : ""}${
        unusedCents > 0 ? `${invoiceCount > 1 ? "," : " —"} partly credited to account` : ""
      }`,
      amount_cents: amountCents,
      ref_id: paymentId,
      ref_table: "crm_payments",
    });
  } catch (err) {
    log.error("recorded payment but a follow-up step failed", { error: err, paymentId });
  }

  return "applied";
}

/** One charge split across several invoices for the same client — one
 * crm_payments row with one crm_payment_allocations row per invoice, the same
 * way a manually-recorded multi-invoice payment is split. */
async function recordMultiInvoiceCharge({
  db,
  supabase,
  paymentIntent,
  connectedAccountId,
}: RecordStripeChargeArgs): Promise<RecordStripeChargeResult> {
  if (!connectedAccountId) {
    log.error("succeeded payment intent with no connected account", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  const { org_id: orgId, client_id: clientId, allocations: encodedAllocations } = paymentIntent.metadata;
  const feeCents = parseInt(paymentIntent.metadata.fee_cents, 10);

  if (!orgId || !clientId || !encodedAllocations || !Number.isFinite(feeCents)) {
    log.error("missing/invalid metadata on multi-invoice payment intent", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  if (!(await accountOwnedByOrg(db, orgId, connectedAccountId))) {
    log.error("payment intent metadata org_id does not own the connected account the charge fired on", {
      paymentIntentId: paymentIntent.id,
      orgId,
      connectedAccountId,
    });
    return "error";
  }

  let allocations: { invoiceId: string; amountCents: number }[];
  try {
    allocations = decodeAllocations(encodedAllocations);
  } catch (err) {
    log.error("could not decode allocations on multi-invoice payment intent", { error: err, paymentIntentId: paymentIntent.id });
    return "error";
  }
  if (allocations.length === 0 || allocations.some((a) => !a.invoiceId || !Number.isFinite(a.amountCents) || a.amountCents <= 0)) {
    log.error("multi-invoice payment intent has no valid allocations", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  const { method, isAch } = await resolveMethod(db, orgId, paymentIntent, connectedAccountId);

  // Each allocation is clamped to its invoice's live balance inside the RPC —
  // same race and same fix as the single-invoice path. The RPC also scopes
  // every invoice to metadata.client_id (or its child sub-accounts): the
  // client id and the encoded allocation list are two independently-editable
  // metadata keys a connected account's own owner can forge, so a mismatch
  // between them must not apply one client's charge to another's invoice.
  return applyViaRpc({
    db,
    supabase,
    paymentIntent,
    orgId,
    clientId,
    allocations,
    feeCents,
    method,
    isAch,
  });
}
