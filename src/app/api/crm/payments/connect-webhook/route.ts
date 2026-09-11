import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe, getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { statusForAccount } from "@/lib/stripe/connect";
import { recordStripeCharge, accountOwnedByOrg } from "@/lib/stripe/record-charge";
import { clearPendingCharge, markInvoicesPendingCharge, isPendingChargeStatus } from "@/lib/stripe/pending-charge";
import { decodeAllocations } from "@/lib/stripe/crm-payments";
import { summarizePaymentMethod } from "@/lib/stripe/saved-payment-methods";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
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
      return NextResponse.json({ received: true, duplicate: true });
    }
    log.error("failed to record event id", { error: dedupeErr, eventId: event.id });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
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

    // A customer paying by bank account on the portal confirms the intent in
    // their own browser, so the server never sees a status for it — only this
    // event does. The autopay routes mark their own in-flight charges
    // synchronously; this covers every other path uniformly.
    case "payment_intent.processing": {
      const pendingIntent = event.data.object as Stripe.PaymentIntent;
      const pendingSource = pendingIntent.metadata?.source;
      const pendingOrgId = pendingIntent.metadata?.org_id;
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
        await markInvoicesPendingCharge({ db, paymentIntent: pendingIntent, amountsByInvoiceId: amounts });
      }
      break;
    }

    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const source = paymentIntent.metadata?.source;
      const result =
        source === "crm_invoice_multi"
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
        .select("id, org_id, client_id, invoice_id, refunded_amount_cents")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();
      if (!payment || !(await eventAccountOwnedByOrg(db, payment.org_id, event.account))) break;

      const alreadyRecordedCents = payment.refunded_amount_cents ?? 0;
      const deltaCents = charge.amount_refunded - alreadyRecordedCents;
      if (deltaCents <= 0) break; // already reconciled (e.g. our own refund route already applied this)

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: refundErr } = await (db.rpc as any)("refund_payment", {
          p_payment_id: payment.id,
          p_refund_amount_cents: deltaCents,
        });
        if (refundErr) throw refundErr;

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
        log.error("failed to reconcile charge.refunded", { error: err, paymentId: payment.id });
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
      }
      break;
    }

    default:
      break;
  }

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
