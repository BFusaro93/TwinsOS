import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { logger } from "@/lib/logger";

const log = logger.child("stripe connect webhook");

/** Stripe's own statuses for a connected account (there's no `status` field on the
 * Account object) — derived from the requirements/capabilities. */
function statusForAccount(account: Stripe.Account): "active" | "restricted" | "pending" {
  if (account.requirements?.disabled_reason) return "restricted";
  if (account.charges_enabled && account.payouts_enabled) return "active";
  return "pending";
}

export async function POST(request: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  } catch (err) {
    log.error("signature verification failed", { error: err });
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

  if (event.type !== "account.updated") {
    return NextResponse.json({ received: true });
  }

  const account = event.data.object as Stripe.Account;

  try {
    const { error } = await db
      .from("organizations")
      .update({
        stripe_connect_status: statusForAccount(account),
        stripe_connect_charges_enabled: account.charges_enabled,
        stripe_connect_payouts_enabled: account.payouts_enabled,
      })
      .eq("stripe_connect_account_id", account.id);
    if (error) throw error;
  } catch (err) {
    log.error("failed to apply account.updated", { error: err, accountId: account.id });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
