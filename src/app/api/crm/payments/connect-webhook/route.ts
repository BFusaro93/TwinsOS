import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe, getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { statusForAccount } from "@/lib/stripe/connect";
import { recordStripeCharge, accountOwnedByOrg } from "@/lib/stripe/record-charge";
import {
  recordEstimateDepositCharge,
  markEstimateDepositPending,
  clearEstimateDepositPending,
  recordEstimateDepositFailure,
  syncEstimateDepositWithPayment,
} from "@/lib/stripe/record-estimate-deposit";
import { clearPendingCharge, markInvoicesPendingCharge, isPendingChargeStatus } from "@/lib/stripe/pending-charge";
import { decodeAllocations } from "@/lib/stripe/crm-payments";
import { summarizePaymentMethod } from "@/lib/stripe/saved-payment-methods";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { notifyStaffOfFailedDeposit } from "@/lib/estimate-deposit-notify";
import { resolveBroadcastRecipients } from "@/lib/notify-shared";
import { logger } from "@/lib/logger";

const log = logger.child("stripe connect webhook");

/** Whether the connected account an event fired on is the one on file for
 * this org — see accountOwnedByOrg()'s own comment for why this check is not
 * optional. Re-exported through the shared recorder so both the webhook and
 * the synchronous charge routes apply the identical rule. */
// any: the generated Supabase types don't cover every table this webhook touches
// (crm_payment_allocations, client_activity, stripe_webhook_events).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventAccountOwnedByOrg = (db: any, orgId: string, eventAccount: string) =>
  accountOwnedByOrg(db, orgId, eventAccount);

/**
 * Stripe signs each event with the signing secret of the endpoint that sent
 * it, and endpoints are per-mode: a live endpoint and a test/sandbox endpoint
 * have different secrets. An org whose Connect account is test-mode (see
 * getStripeForOrg) therefore delivers events signed with the TEST endpoint's
 * secret, which would fail verification against the live one and silently
 * leave its invoices unpaid — the webhook is the only thing that applies a
 * card payment to an invoice.
 *
 * Try every configured secret. This cannot produce a false accept: a
 * signature only validates against the exact secret that produced it.
 */
function connectWebhookSecrets(): string[] {
  return [
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST,
  ].filter((v): v is string => Boolean(v));
}

export async function POST(request: Request) {
  const webhookSecrets = connectWebhookSecrets();
  if ((!isStripeConfigured() && !isStripeTestConfigured()) || webhookSecrets.length === 0) {
    log.error("connect webhook received but not configured", {
      hasSecretKey: isStripeConfigured() || isStripeTestConfigured(),
      hasWebhookSecret: webhookSecrets.length > 0,
    });
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  // Signature verification is pure crypto against the webhook secret — it
  // doesn't call the Stripe API, so any configured client works here
  // regardless of which mode it holds a key for.
  const stripe = isStripeConfigured() ? getStripe() : getStripeForOrg(false);
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    log.error("connect webhook missing stripe-signature header");
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event | null = null;
  let lastVerifyError: unknown = null;
  for (const secret of webhookSecrets) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
      break;
    } catch (err) {
      lastVerifyError = err;
    }
  }
  if (!event) {
    log.error(
      "Stripe Connect webhook signature verification FAILED — no configured signing secret matched. " +
        "This is almost always a misconfigured/rotated STRIPE_CONNECT_WEBHOOK_SECRET (live) or " +
        "STRIPE_CONNECT_WEBHOOK_SECRET_TEST (test/sandbox): the value must be the 'Signing secret' " +
        "(whsec_...) of the SPECIFIC Stripe webhook endpoint delivering these events, in the SAME mode " +
        "as the connected account. Card payments confirmed in the browser are applied to invoices ONLY " +
        "by this webhook, so while this fails those payments will not be recorded.",
      {
        error: lastVerifyError,
        secretsTried: webhookSecrets.length,
        // Names only — never the values.
        secretEnvVarsPresent: [
          process.env.STRIPE_CONNECT_WEBHOOK_SECRET ? "STRIPE_CONNECT_WEBHOOK_SECRET" : null,
          process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST ? "STRIPE_CONNECT_WEBHOOK_SECRET_TEST" : null,
        ].filter(Boolean),
      }
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // ── Idempotency: same dedup table the billing webhook uses. subscription_id
  // stays null here — these events aren't tied to a subscription. ───────────
  const { error: dedupeErr } = await db.from("stripe_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
    subscription_id: null,
    event_created: new Date(event.created * 1000).toISOString(),
  });
  if (dedupeErr) {
    if (dedupeErr.code === "23505") {
      // Seen before — but only a real duplicate if that delivery FINISHED.
      // The dedupe row commits before the handler runs, so a row with no
      // processed_at means a previous attempt died part-way and Stripe is
      // retrying. Short-circuiting those was silently dropping the retry, and
      // for payment_intent.succeeded on ACH this route is the only thing that
      // records the payment — the customer was charged and nothing was
      // written. Fall through and reprocess; the handlers are idempotent.
      const { data: prior } = await db
        .from("stripe_webhook_events")
        .select("processed_at")
        .eq("event_id", event.id)
        .maybeSingle();
      if (prior?.processed_at) {
        return NextResponse.json({ received: true, duplicate: true });
      }
      log.info("reprocessing a webhook whose previous delivery did not finish", { eventId: event.id, eventType: event.type });
    } else {
      log.error("failed to record event id", { error: dedupeErr, eventId: event.id });
      return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }
  }

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      try {
        const { error } = await db
          .from("organizations")
          .update({
            stripe_connect_status: statusForAccount(account),
            stripe_connect_charges_enabled: account.charges_enabled,
            stripe_connect_payouts_enabled: account.payouts_enabled,
            // Stripe's Account object itself has no `livemode` field — the
            // enclosing Event does, and reflects the mode of the account the
            // event fired on.
            stripe_connect_livemode: event.livemode,
          })
          .eq("stripe_connect_account_id", account.id);
        if (error) throw error;
      } catch (err) {
        log.error("failed to apply account.updated", { error: err, accountId: account.id });
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const failedIntent = event.data.object as Stripe.PaymentIntent;
      const { org_id: failedOrgId, client_id: failedClientId } = failedIntent.metadata ?? {};

      // An ACH deposit returned by the bank (NSF, closed account), or a
      // declined card. Nothing to reverse — no crm_payments row is ever
      // written for an unsettled debit — but the failure has to be RECORDED,
      // not just cleared. Simply dropping the pending marker (the old
      // behaviour) put the estimate back to looking like one where the client
      // skipped the deposit: no trace, no notification, and no way to retry.
      //
      // recordEstimateDepositFailure replaces the pending marker with a
      // failure marker in one write, and returns null for anything it
      // shouldn't act on — including a stale event for a deposit that has
      // since been collected, which must never un-collect it.
      if (failedIntent.metadata?.source === "crm_estimate_deposit") {
        const failure =
          failedOrgId &&
          event.account &&
          (await eventAccountOwnedByOrg(db, failedOrgId, event.account))
            ? await recordEstimateDepositFailure(db, failedIntent)
            : null;
        if (failure) {
          await notifyStaffOfFailedDeposit(db, failure);
        } else {
          // Not a failure worth recording — an unattributable account, a
          // deposit already collected, a newer attempt in flight, or a card
          // declined while the client is still on the deposit step. Clearing
          // the marker is all that's left to do, and it matches on the intent
          // id so it can never clobber a newer one.
          await clearEstimateDepositPending(db, failedIntent.id);
        }
        break;
      }

      if (
        (failedIntent.metadata?.source === "crm_invoice" || failedIntent.metadata?.source === "crm_invoice_multi") &&
        failedOrgId &&
        failedClientId &&
        event.account &&
        (await eventAccountOwnedByOrg(db, failedOrgId, event.account))
      ) {
        await fireSimpleTrigger(supabase, {
          orgId: failedOrgId,
          clientId: failedClientId,
          triggerType: "credit_card_charge_failed",
        });
        // The charge is dead — drop the "payment in flight" marker so the
        // invoice becomes chargeable again instead of looking pending forever.
        await clearPendingCharge(db, failedIntent.id);
      }
      break;
    }

    // The other way an in-flight intent dies. Staff cancelling from the Stripe
    // dashboard, or a requires_action card intent that expires unconfirmed,
    // fire ONLY this event — never payment_failed — so without a case here the
    // in-flight marker was never cleared. InvoicesList drops a marked invoice
    // out of "chargeable now", disables its Charge button and skips it in
    // Charge All, so the invoice could never be collected from the queue
    // again. Unlike payment_failed there's no automation to fire; releasing
    // the invoice is the whole job, and clearPendingCharge matches on the
    // intent id so it cannot clobber a newer marker.
    case "payment_intent.canceled": {
      const canceledIntent = event.data.object as Stripe.PaymentIntent;
      const canceledSource = canceledIntent.metadata?.source;
      if (canceledSource === "crm_invoice" || canceledSource === "crm_invoice_multi") {
        await clearPendingCharge(db, canceledIntent.id);
      } else if (canceledSource === "crm_estimate_deposit") {
        await clearEstimateDepositPending(db, canceledIntent.id);
      }
      break;
    }

    // A customer paying by bank account on the portal confirms the intent in
    // their own browser, so the server never sees a status for it — only this
    // event does. The autopay routes mark their own in-flight charges
    // synchronously; this covers every other path uniformly.
    case "payment_intent.processing": {
      const pendingIntent = event.data.object as Stripe.PaymentIntent;
      const pendingSource = pendingIntent.metadata?.source;
      const pendingOrgId = pendingIntent.metadata?.org_id;

      // A proposal deposit paid by ACH lands here and stays here for days.
      // The acceptance has already gone through — a signed proposal shouldn't
      // wait on a bank debit — so mark the estimate as having a deposit in
      // flight, or it looks exactly like one where the client skipped it.
      if (
        pendingSource === "crm_estimate_deposit" &&
        pendingOrgId &&
        event.account &&
        (await eventAccountOwnedByOrg(db, pendingOrgId, event.account))
      ) {
        await markEstimateDepositPending(db, pendingIntent);
        break;
      }

      if (
        !event.account ||
        !pendingOrgId ||
        !isPendingChargeStatus(pendingIntent.status) ||
        (pendingSource !== "crm_invoice" && pendingSource !== "crm_invoice_multi") ||
        !(await eventAccountOwnedByOrg(db, pendingOrgId, event.account))
      ) {
        break;
      }
      const amounts = new Map<string, number>();
      if (pendingSource === "crm_invoice_multi" && pendingIntent.metadata?.allocations) {
        for (const a of decodeAllocations(pendingIntent.metadata.allocations)) {
          amounts.set(a.invoiceId, a.amountCents);
        }
      } else if (pendingIntent.metadata?.invoice_id) {
        // Balance rather than the charged amount: the amount can include a
        // processing fee, and what's pending against the invoice is its balance.
        amounts.set(
          pendingIntent.metadata.invoice_id,
          Number(pendingIntent.metadata.balance_cents) || pendingIntent.amount
        );
      }
      if (amounts.size > 0) {
        // Stripe doesn't guarantee ordering: if payment_intent.succeeded already
        // landed and recorded this intent, a late "processing" event must not
        // re-mark the now-paid invoice as pending (nothing would clear it).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: alreadyRecorded } = await (db as any)
          .from("crm_payments")
          .select("id")
          .eq("stripe_payment_intent_id", pendingIntent.id)
          .limit(1)
          .maybeSingle();
        if (alreadyRecorded) break;
        await markInvoicesPendingCharge({ db, paymentIntent: pendingIntent, amountsByInvoiceId: amounts });
      }
      break;
    }

    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const source = paymentIntent.metadata?.source;
      const result =
        source === "crm_estimate_deposit"
          // A proposal deposit is taken before any invoice exists, so it is
          // recorded as unapplied account credit rather than against a
          // balance. This webhook is its only writer.
          ? await recordEstimateDepositCharge({ db, paymentIntent, connectedAccountId: event.account })
          : source === "crm_invoice_multi"
            ? await applyCrmInvoiceMultiPayment(db, supabase, event)
            : await applyCrmInvoicePayment(db, supabase, event);
      if (result === "error") {
        return NextResponse.json({ error: "Failed to apply payment to invoice" }, { status: 500 });
      }
      // Settled: the payment is recorded and the balance is down, so the
      // pending marker has done its job. Cleared by intent id, so this covers
      // single and combined charges alike and is safe to run twice.
      await clearPendingCharge(db, paymentIntent.id);
      break;
    }

    // Fires when a saved card's details change — most commonly Stripe's Account
    // Updater silently refreshing an expiring card's new number/exp date behind
    // the scenes, but also any explicit update. Matched by payment method id
    // rather than customer id since that's the identifier we actually store
    // on the client row (src/app/api/crm/payments/connect/setup-intent/route.ts).
    case "payment_method.updated": {
      const pm = event.data.object as Stripe.PaymentMethod;
      if (!event.account) break;

      const { data: matchedClient } = await db
        .from("clients")
        .select("id, org_id")
        .eq("saved_payment_method_id", pm.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (matchedClient && (await eventAccountOwnedByOrg(db, matchedClient.org_id, event.account))) {
        await db
          .from("clients")
          .update({ saved_payment_method_summary: summarizePaymentMethod(pm) })
          .eq("id", matchedClient.id);
        await fireSimpleTrigger(supabase, {
          orgId: matchedClient.org_id,
          clientId: matchedClient.id,
          triggerType: "credit_card_updated",
        });
      }
      break;
    }

    // Fires when a charge is refunded — including an ACH debit that
    // initially succeeded but was later returned by the client's bank
    // (NSF, closed account, unauthorized) days after payment_intent.succeeded
    // already marked the invoice paid. Also fires for a refund WE initiated
    // via /api/crm/payments/[id]/refund, so this must be idempotent against
    // that: reconcile against Stripe's own amount_refunded rather than
    // blindly applying charge.amount_refunded as a fresh delta, or a
    // staff-initiated refund would get double-counted here.
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!paymentIntentId || !event.account) break;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: payment } = await (db as any)
        .from("crm_payments")
        .select("id, org_id, client_id, invoice_id, amount_cents, refunded_amount_cents, processing_fee_cents")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();
      if (!payment || !(await eventAccountOwnedByOrg(db, payment.org_id, event.account))) break;

      // Stripe refunds the GROSS it charged; crm_payments.amount_cents is the
      // net the client was credited, with any card processing fee held
      // separately in processing_fee_cents. A full refund of a fee-bearing
      // charge therefore reports more than the payment is worth — $2,058
      // against a $2,000 payment. reconcile_stripe_payment_reversal() clamps
      // the target to amount_cents (the fee has no customer-money counterpart
      // to reverse — it was never credited), so the old "exceeds refundable
      // balance" 500-and-retry-forever can't recur.
      //
      // TARGET, not delta: the RPC brings refunded_amount_cents up to Stripe's
      // own amount_refunded under the payment row lock. The staff refund route
      // does the same, so whichever of the two lands first applies it and the
      // other is a no-op — they converge instead of each adding a delta.
      let deltaCents = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: applied, error: reconcileErr } = await (db.rpc as any)("reconcile_stripe_payment_reversal", {
          p_payment_id: payment.id,
          p_target_reversed_cents: charge.amount_refunded,
        });
        if (reconcileErr) throw reconcileErr;
        deltaCents = typeof applied === "number" ? applied : 0;
        if (charge.amount_refunded > (payment.amount_cents ?? 0)) {
          log.info("clamped a gross Stripe refund to the payment's refundable amount", {
            paymentIntentId,
            chargeRefundedCents: charge.amount_refunded,
            paymentAmountCents: payment.amount_cents,
            processingFeeCents: payment.processing_fee_cents,
            appliedCents: deltaCents,
          });
        }
      } catch (err) {
        log.error("failed to reconcile charge.refunded", { error: err, paymentId: payment.id });
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
      }
      // A refunded/charged-back proposal deposit must stop showing as collected
      // on its estimate. Runs even when the delta is 0 (the staff refund route
      // may have applied the reversal first); it recomputes from the payment row.
      try {
        await syncEstimateDepositWithPayment(db, payment.org_id, paymentIntentId);
      } catch (err) {
        log.error("failed to sync estimate deposit after refund", { error: err, paymentId: payment.id });
      }
      if (deltaCents <= 0) break; // already reconciled (e.g. our own refund route already applied this)

      try {
        // refund_payment() reverses the invoice side itself — it walks the
        // allocation rows, reduces or deletes each one, and calls
        // apply_payment_to_invoice(-share) per invoice, falling back to
        // crm_payments.invoice_id when the payment has no allocations
        // (20260908160000). This route used to repeat that reversal here,
        // which double-counted every bank-returned ACH and every refund
        // issued from the Stripe dashboard: on a full refund the RPC deletes
        // the allocations, so the re-read below found none and the
        // invoice_id fallback re-applied the WHOLE delta a second time. On an
        // invoice paid by two cards, refunding one left the invoice showing
        // the full balance again — the other payment's money vanished and the
        // invoice went back into the autopay/"To Charge" queue, debiting the
        // customer for money they had already paid. Do not reintroduce it.

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db.rpc as any)("sync_client_balance", { p_client_id: payment.client_id });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from("client_activity").insert({
          org_id: payment.org_id,
          client_id: payment.client_id,
          activity_type: "payment",
          subject: `Payment reversed: $${(deltaCents / 100).toFixed(2)} (returned by bank/card issuer)`,
          ref_id: payment.id,
          ref_table: "crm_payments",
          amount_cents: -deltaCents,
        });

        await fireSimpleTrigger(supabase, {
          orgId: payment.org_id,
          clientId: payment.client_id,
          triggerType: "credit_card_charge_failed",
        });
      } catch (err) {
        // The reversal itself is already committed (and a retry would be a
        // no-op for it), so a failed follow-up must not 500 the event.
        log.error("reversed a refunded payment but a follow-up step failed", { error: err, paymentId: payment.id });
      }
      break;
    }

    // Chargebacks. Stripe debits the disputed amount (plus a dispute fee) from
    // the connected account's balance at funds_withdrawn and returns it at
    // funds_reinstated if the dispute is won. Previously none of these events
    // were handled: a disputed payment kept showing as good money on a paid
    // invoice, and nobody at the org was told a response deadline was running.
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated": {
      const dispute = event.data.object as Stripe.Dispute;
      if (!event.account) break;
      const result = await handleDisputeEvent(db, supabase, event.type, dispute, event.account);
      if (result === "error") {
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
      }
      break;
    }

    default:
      break;
  }

  // Reached only when the handler above didn't bail with a 500. Stamping the
  // row here is what makes a later delivery of the same event a genuine
  // duplicate; leaving it unstamped keeps the event replayable.
  await db
    .from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", event.id);

  return NextResponse.json({ received: true });
}

/**
 * Applies a succeeded crm_invoice / crm_invoice_multi PaymentIntent (from a
 * connected account) to its invoice(s).
 *
 * The actual ledger write lives in src/lib/stripe/record-charge.ts and is
 * shared with the synchronous charge routes (autopay/charge,
 * autopay/charge-multi), which now record the payment the moment Stripe
 * confirms it off-session. This webhook is therefore a backstop: it stays the
 * ONLY applier for browser-confirmed intents (create-intent /
 * create-intent-multi) and for ACH (which confirms as `processing` and only
 * succeeds days later), and is a no-op when the synchronous path already
 * recorded the charge — deduped in the database on the PaymentIntent id.
 */
async function applyCrmInvoicePayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  event: Stripe.Event
): Promise<"applied" | "skipped" | "error"> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  if (paymentIntent.metadata?.source !== "crm_invoice") return "skipped";
  if (!event.account) {
    log.error("payment_intent.succeeded with no connected account on event", { paymentIntentId: paymentIntent.id });
    return "error";
  }
  const result = await recordStripeCharge({ db, supabase, paymentIntent, connectedAccountId: event.account });
  return result === "already_recorded" ? "skipped" : result;
}

/** Multi-invoice counterpart — see applyCrmInvoicePayment above. */
async function applyCrmInvoiceMultiPayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  event: Stripe.Event
): Promise<"applied" | "skipped" | "error"> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  if (paymentIntent.metadata?.source !== "crm_invoice_multi") return "skipped";
  if (!event.account) {
    log.error("payment_intent.succeeded with no connected account on event", { paymentIntentId: paymentIntent.id });
    return "error";
  }
  const result = await recordStripeCharge({ db, supabase, paymentIntent, connectedAccountId: event.account });
  return result === "already_recorded" ? "skipped" : result;
}

/**
 * charge.dispute.* for a CRM invoice payment.
 *
 * - every event: mirror the dispute's id/status onto the payment
 *   (crm_payments.stripe_dispute_id / dispute_status / disputed_at, added by
 *   20260927100200). Best-effort — a failed marker write is logged, never a 500.
 * - created: in-app notification to the org's admins/managers (the same
 *   default audience as the other broadcast notifications) + a client
 *   activity entry, since a dispute has a response deadline.
 * - funds_withdrawn: reverse it like a refund. The target passed to
 *   reconcile_stripe_payment_reversal() is Stripe's amount_refunded plus the
 *   disputed amount, so a retried delivery is a no-op and it converges with
 *   any refund already recorded.
 * - funds_reinstated / closed-won: reinstate_stripe_payment_reversal()
 *   converges the ledger back down to Stripe's refunded total, restoring the
 *   money as unapplied credit and re-applying it to the payment's invoice only
 *   if that invoice still owes (so a re-charge in the meantime is not
 *   double-counted — the surplus stays as client credit).
 */
async function handleDisputeEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  eventType: string,
  dispute: Stripe.Dispute,
  eventAccount: string
): Promise<"ok" | "error"> {
  const paymentIntentId =
    typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id ?? null;
  if (!paymentIntentId) return "ok";

  const { data: payment } = await db
    .from("crm_payments")
    .select("id, org_id, client_id, invoice_id, amount_cents, refunded_amount_cents")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!payment || !(await eventAccountOwnedByOrg(db, payment.org_id, eventAccount))) return "ok";

  const { error: markErr } = await db
    .from("crm_payments")
    .update({
      stripe_dispute_id: dispute.id,
      dispute_status: dispute.status,
      disputed_at: new Date(dispute.created * 1000).toISOString(),
    })
    .eq("id", payment.id);
  if (markErr) log.error("failed to mark payment as disputed", { error: markErr, paymentId: payment.id, disputeId: dispute.id });

  // Flag/unflag the invoice(s) so the autopay queues and charge routes won't
  // offer them for charging while a chargeback is open (a won dispute returns
  // the funds, so re-charging in the meantime would collect twice). Status-based
  // so out-of-order deliveries converge on the dispute's real state. Must run
  // BEFORE the reversal below, which deletes the payment's allocation rows.
  try {
    const OPEN_DISPUTE_STATUSES = ["needs_response", "under_review", "warning_needs_response", "warning_under_review"];
    if (OPEN_DISPUTE_STATUSES.includes(dispute.status)) {
      const { data: allocs } = await db
        .from("crm_payment_allocations")
        .select("invoice_id")
        .eq("payment_id", payment.id);
      const invoiceIds = [
        ...new Set([payment.invoice_id, ...((allocs ?? []).map((a: { invoice_id: string }) => a.invoice_id))].filter(Boolean)),
      ] as string[];
      if (invoiceIds.length > 0) {
        await db.from("crm_invoices").update({ open_dispute_payment_id: payment.id }).in("id", invoiceIds).is("deleted_at", null);
      }
    } else {
      await db.from("crm_invoices").update({ open_dispute_payment_id: null }).eq("open_dispute_payment_id", payment.id);
    }
  } catch (err) {
    log.error("failed to update the invoice dispute flag", { error: err, paymentId: payment.id, disputeId: dispute.id });
  }

  const amount = `$${(dispute.amount / 100).toFixed(2)}`;

  if (eventType === "charge.dispute.funds_withdrawn") {
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
    let refundedAtStripe = 0;
    if (chargeId) {
      try {
        const { data: org } = await db
          .from("organizations")
          .select("stripe_connect_livemode")
          .eq("id", payment.org_id)
          .single();
        const orgStripe = getStripeForOrg(org?.stripe_connect_livemode ?? null);
        const charge = await orgStripe.charges.retrieve(chargeId, undefined, { stripeAccount: eventAccount });
        refundedAtStripe = charge.amount_refunded ?? 0;
      } catch (err) {
        log.error("failed to load the disputed charge", { error: err, chargeId, disputeId: dispute.id });
        return "error"; // retry — the reversal target needs Stripe's refunded amount
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: applied, error: reconcileErr } = await (db.rpc as any)("reconcile_stripe_payment_reversal", {
      p_payment_id: payment.id,
      p_target_reversed_cents: refundedAtStripe + dispute.amount,
    });
    if (reconcileErr) {
      log.error("failed to reverse a disputed payment", { error: reconcileErr, paymentId: payment.id, disputeId: dispute.id });
      return "error";
    }
    const deltaCents = typeof applied === "number" ? applied : 0;
    if (deltaCents > 0) {
      try {
        await syncEstimateDepositWithPayment(db, payment.org_id, paymentIntentId);
        await db.rpc("sync_client_balance", { p_client_id: payment.client_id });
        await db.from("client_activity").insert({
          org_id: payment.org_id,
          client_id: payment.client_id,
          activity_type: "payment",
          subject: `Payment reversed: $${(deltaCents / 100).toFixed(2)} (chargeback — funds withdrawn by Stripe)`,
          ref_id: payment.id,
          ref_table: "crm_payments",
          amount_cents: -deltaCents,
        });
      } catch (err) {
        log.error("reversed a disputed payment but a follow-up step failed", { error: err, paymentId: payment.id });
      }
    }
  }

  // Won dispute: Stripe returns the funds (funds_reinstated, and the closed
  // event with status "won"). Converge the ledger back DOWN to Stripe's own
  // refunded total — idempotent, so both events and any retry are safe — and
  // re-apply the money to the payment's invoice if it still owes.
  if (eventType === "charge.dispute.funds_reinstated" || (eventType === "charge.dispute.closed" && dispute.status === "won")) {
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
    if (chargeId) {
      let refundedAtStripe = 0;
      try {
        const { data: org } = await db
          .from("organizations")
          .select("stripe_connect_livemode")
          .eq("id", payment.org_id)
          .single();
        const orgStripe = getStripeForOrg(org?.stripe_connect_livemode ?? null);
        const charge = await orgStripe.charges.retrieve(chargeId, undefined, { stripeAccount: eventAccount });
        refundedAtStripe = charge.amount_refunded ?? 0;
      } catch (err) {
        log.error("failed to load the disputed charge for reinstatement", { error: err, chargeId, disputeId: dispute.id });
        return "error";
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: restored, error: reinstateErr } = await (db.rpc as any)("reinstate_stripe_payment_reversal", {
        p_payment_id: payment.id,
        p_target_reversed_cents: refundedAtStripe,
      });
      if (reinstateErr) {
        log.error("failed to reinstate a won-dispute payment", { error: reinstateErr, paymentId: payment.id, disputeId: dispute.id });
        return "error";
      }
      const restoredCents = typeof restored === "number" ? restored : 0;
      if (restoredCents > 0) {
        try {
          await db.from("client_activity").insert({
            org_id: payment.org_id,
            client_id: payment.client_id,
            activity_type: "payment",
            subject: `Payment reinstated: $${(restoredCents / 100).toFixed(2)} (chargeback won)`,
            ref_id: payment.id,
            ref_table: "crm_payments",
            amount_cents: restoredCents,
          });
        } catch (err) {
          log.error("reinstated a payment but the activity entry failed", { error: err, paymentId: payment.id });
        }
      }
    }
  }

  const notify =
    eventType === "charge.dispute.created"
      ? {
          title: `Payment disputed — ${amount}`,
          message: `A client disputed a ${amount} online payment (reason: ${dispute.reason.replace(/_/g, " ")}). Respond in your Stripe dashboard${
            dispute.evidence_details?.due_by
              ? ` by ${new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString("en-US")}`
              : ""
          } or the funds will be withdrawn.`,
        }
      : eventType === "charge.dispute.funds_withdrawn"
        ? { title: `Chargeback — ${amount} withdrawn`, message: `Stripe withdrew ${amount} for a disputed payment. The payment has been reversed and the invoice balance reopened.` }
        : eventType === "charge.dispute.closed" && dispute.status === "won"
          ? { title: `Dispute won — ${amount}`, message: `A ${amount} payment dispute was closed in your favor. If the payment had been reversed it was restored to the invoice (or to the client's unapplied credit if the invoice no longer owes).` }
          : null;

  if (notify) {
    try {
      const recipients = await resolveBroadcastRecipients(supabase, payment.org_id, "paymentDisputeRecipientIds");
      if (recipients.length) {
        await db.from("notifications").insert(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recipients.map((p: any) => ({
            org_id: payment.org_id,
            user_id: p.id,
            type: "payment_disputed",
            title: notify.title,
            message: notify.message,
            entity_id: payment.invoice_id ?? payment.client_id,
            entity_type: payment.invoice_id ? "invoice" : "client",
          }))
        );
      }
      if (eventType === "charge.dispute.created") {
        await db.from("client_activity").insert({
          org_id: payment.org_id,
          client_id: payment.client_id,
          activity_type: "payment",
          subject: `Payment disputed: ${amount} (${dispute.reason.replace(/_/g, " ")})`,
          ref_id: payment.id,
          ref_table: "crm_payments",
        });
      }
    } catch (err) {
      log.error("failed to notify staff of a payment dispute", { error: err, paymentId: payment.id, disputeId: dispute.id });
    }
  }

  return "ok";
}
